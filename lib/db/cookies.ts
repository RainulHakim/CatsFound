import type { CookieOptions } from "@supabase/ssr";

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Hardens the cookie options @supabase/ssr hands us. The library defaults to
 * httpOnly=false (for its browser client, which we never use) and a 400-day
 * maxAge. Auth cookies are rewritten whenever the access token refreshes, so a
 * fixed 30-day maxAge on every write gives a 30-day sliding session.
 */
export function hardenCookieOptions(options: CookieOptions, secure: boolean): CookieOptions {
  const isRemoval = options.maxAge === 0;
  return {
    ...options,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: isRemoval ? 0 : SESSION_MAX_AGE_SECONDS,
  };
}

export function isSecureContext(): boolean {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
}
