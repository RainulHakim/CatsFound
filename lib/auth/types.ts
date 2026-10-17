import type { UserRole } from "@/lib/db/types";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
};

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

export type AuthFailure =
  "invalid_email" | "rate_limited" | "invalid_code" | "expired_or_used" | "provider_error";

/**
 * The seam between feature code and the identity provider. Magic link today;
 * Davidson SSO later means a new implementation of this, nothing else.
 */
export interface AuthProvider {
  /** The verified current user, or null. Role comes from the database. */
  getUser(): Promise<SessionUser | null>;
  /** Send a sign-in email (6-digit code + link). */
  requestSignIn(email: string, ctx: { ip: string }): Promise<AuthResult>;
  /** Complete sign-in with the 6-digit code. */
  verifyCode(email: string, code: string): Promise<AuthResult>;
  /** Complete sign-in from the emailed link's token hash. */
  verifyLink(tokenHash: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}
