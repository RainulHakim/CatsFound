import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/db/types";
import { createSupabaseAuthProvider } from "./supabase-provider";
import type { AuthProvider, SessionUser } from "./types";

export type { AuthFailure, AuthResult, SessionUser } from "./types";

/** The active provider. Swap here for SSO. */
export const auth: AuthProvider = createSupabaseAuthProvider();

/** Current user, memoised for the duration of one request. */
export const getUser = cache(() => auth.getUser());

export function hasRole(user: SessionUser | null, roles: readonly UserRole[]): boolean {
  return user !== null && roles.includes(user.role);
}

/** For pages: redirect to sign-in when there is no session. */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}

/**
 * For pages and actions that need a role. Checked server-side against the
 * database on every call. Signed-out users are sent to sign in; signed-in
 * users without the role get ForbiddenError (rendered as 403/404 by callers).
 */
export async function requireRole(
  roles: readonly UserRole[],
  nextPath: string,
): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!hasRole(user, roles)) throw new ForbiddenError();
  return user;
}
