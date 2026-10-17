import "server-only";
import { createUserClient } from "@/lib/db/server";
import { log } from "@/lib/log";
import { allow, dbLimiter, LIMITS, type Limiter } from "@/lib/rate-limit";
import { hashIp } from "@/lib/security/request";
import { serverEnv } from "@/lib/env";
import { ALLOWED_EMAIL } from "@/lib/validation/auth";
import type { AuthProvider, AuthResult, SessionUser } from "./types";

type Deps = { limiter: Limiter };

export function createSupabaseAuthProvider(deps: Deps = { limiter: dbLimiter }): AuthProvider {
  return {
    async getUser(): Promise<SessionUser | null> {
      const supabase = await createUserClient();
      // getClaims verifies the JWT signature; never trust an unverified session.
      const { data, error } = await supabase.auth.getClaims();
      const sub = data?.claims?.sub;
      if (error || !sub) return null;

      // Role is read from the database (RLS: own row), never from the token.
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, email, role, display_name")
        .eq("id", sub)
        .maybeSingle();
      if (profileError) {
        log.error({ err: profileError.message }, "profile lookup failed");
        return null;
      }
      if (!profile) return null;
      return {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        displayName: profile.display_name,
      };
    },

    async requestSignIn(email, { ip }): Promise<AuthResult> {
      if (!ALLOWED_EMAIL.test(email)) return { ok: false, reason: "invalid_email" };

      const ipKey = hashIp(ip, serverEnv().IP_HASH_SALT);
      const allowed = await allow(deps.limiter, [
        { key: `signin:email:${email}`, limit: LIMITS.signInPerEmail },
        { key: `signin:ip:${ipKey}`, limit: LIMITS.signInPerIp },
      ]);
      if (!allowed) return { ok: false, reason: "rate_limited" };

      const supabase = await createUserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        log.warn({ status: error.status, code: error.code }, "signInWithOtp failed");
        return {
          ok: false,
          reason: error.status === 429 ? "rate_limited" : "provider_error",
        };
      }
      return { ok: true };
    },

    async verifyCode(email, code): Promise<AuthResult> {
      const allowed = await allow(deps.limiter, [
        { key: `verify:email:${email}`, limit: LIMITS.verifyPerEmail },
      ]);
      if (!allowed) return { ok: false, reason: "rate_limited" };

      const supabase = await createUserClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) {
        log.info({ code: error.code }, "verifyOtp (code) failed");
        return {
          ok: false,
          reason: error.code === "otp_expired" ? "expired_or_used" : "invalid_code",
        };
      }
      return { ok: true };
    },

    async verifyLink(tokenHash): Promise<AuthResult> {
      const supabase = await createUserClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (error) {
        log.info({ code: error.code }, "verifyOtp (link) failed");
        return { ok: false, reason: "expired_or_used" };
      }
      return { ok: true };
    },

    async signOut() {
      const supabase = await createUserClient();
      await supabase.auth.signOut({ scope: "local" });
    },
  };
}
