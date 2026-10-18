import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookieOptions } from "@/lib/db/cookies";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { isCsrfSafe } from "@/lib/security/csrf";

/**
 * Runs before every page, Server Action and API route:
 *   1. CSRF: reject cross-origin mutating requests.
 *   2. CSP: fresh nonce per request (Next applies it to its own scripts).
 *   3. Session: refresh the Supabase session so cookies slide (when sign-in is on).
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (
    !isCsrfSafe({
      method: request.method,
      origin: request.headers.get("origin"),
      host,
      secFetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const authEnabled = process.env.AUTH_ENABLED === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: authEnabled ? supabaseUrl : undefined,
    upgradeInsecure: process.env.VERCEL === "1",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Session refresh only matters while sign-in is switched on.
  if (authEnabled && supabaseUrl && supabaseKey) {
    const secure = request.nextUrl.protocol === "https:";
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, hardenCookieOptions(options, secure));
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });
    // Verifies the JWT and refreshes it when expired.
    await supabase.auth.getClaims();
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // No `missing: [prefetch headers]` exclusion: a request could set those
  // headers itself to skip the CSRF check above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp|ico)$).*)",
  ],
};
