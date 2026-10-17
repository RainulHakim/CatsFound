"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AuthFailure } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth/enabled";
import { log } from "@/lib/log";
import { clientIp } from "@/lib/security/request";
import { safeNextPath } from "@/lib/security/redirect";
import { signInRequestSchema, verifyCodeSchema, verifyLinkSchema } from "@/lib/validation/auth";

const NEXT_COOKIE = "cf-next";

export type SignInState = {
  step: "email" | "code";
  email?: string;
  next?: string;
  error?: string;
  fieldError?: string;
};

const MESSAGES: Record<AuthFailure, string> = {
  invalid_email: "Use your @davidson.edu email address.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  invalid_code: "That code didn't match. Check the email and try again.",
  expired_or_used: "That code or link has expired or was already used. Request a new one.",
  provider_error: "Sign-in isn't working right now. Try again in a minute.",
};

const DISABLED = "Sign-in isn't available yet.";

/** A misconfigured server must produce a message, not a crashed page. */
async function safely<T>(fn: () => Promise<T>, onError: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "sign-in failed");
    return onError;
  }
}

export async function requestSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isAuthEnabled()) return { step: "email", error: DISABLED };
  const parsed = signInRequestSchema.safeParse({
    email: formData.get("email") ?? "",
    next: formData.get("next") ?? undefined,
  });
  const next = safeNextPath(parsed.data?.next ?? (formData.get("next") as string | null));
  if (!parsed.success) {
    return { step: "email", next, fieldError: parsed.error.issues[0]?.message };
  }

  const ip = clientIp(await headers());
  const result = await safely(() => auth.requestSignIn(parsed.data.email, { ip }), {
    ok: false as const,
    reason: "provider_error" as const,
  });
  if (!result.ok) {
    return { step: "email", email: parsed.data.email, next, error: MESSAGES[result.reason] };
  }

  // Remember where to go if they finish by clicking the link in this browser.
  (await cookies()).set(NEXT_COOKIE, next, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
    maxAge: 15 * 60,
  });
  return { step: "code", email: parsed.data.email, next };
}

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isAuthEnabled()) return { step: "email", error: DISABLED };
  const parsed = verifyCodeSchema.safeParse({
    email: formData.get("email") ?? "",
    code: formData.get("code") ?? "",
    next: formData.get("next") ?? undefined,
  });
  const email = typeof formData.get("email") === "string" ? (formData.get("email") as string) : "";
  const next = safeNextPath(formData.get("next") as string | null);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((i) => i.path[0] === "email");
    if (emailIssue) return { step: "email", next, fieldError: emailIssue.message };
    return { step: "code", email, next, fieldError: parsed.error.issues[0]?.message };
  }

  const result = await safely(() => auth.verifyCode(parsed.data.email, parsed.data.code), {
    ok: false as const,
    reason: "provider_error" as const,
  });
  if (!result.ok) {
    return { step: "code", email: parsed.data.email, next, error: MESSAGES[result.reason] };
  }
  (await cookies()).delete(NEXT_COOKIE);
  redirect(next);
}

export type ConfirmState = { error?: string };

export async function confirmLink(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!isAuthEnabled()) return { error: DISABLED };
  const parsed = verifyLinkSchema.safeParse({
    token_hash: formData.get("token_hash"),
    type: formData.get("type"),
  });
  if (!parsed.success) return { error: MESSAGES.expired_or_used };

  const result = await safely(() => auth.verifyLink(parsed.data.token_hash), {
    ok: false as const,
    reason: "provider_error" as const,
  });
  if (!result.ok) return { error: MESSAGES[result.reason] };

  const store = await cookies();
  const next = safeNextPath(store.get(NEXT_COOKIE)?.value);
  store.delete(NEXT_COOKIE);
  redirect(next);
}

export async function signOut() {
  await auth.signOut();
  redirect("/");
}
