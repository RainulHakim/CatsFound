import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";
import { hardenCookieOptions, isSecureContext } from "./cookies";
import type { Database } from "./types";

/**
 * Supabase client acting as the signed-in user (or anon). RLS applies.
 * This is the default for every read and write a user makes.
 */
export async function createUserClient() {
  const env = publicEnv();
  const cookieStore = await cookies();
  const secure = isSecureContext();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, hardenCookieOptions(options, secure));
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // proxy.ts refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. BYPASSES RLS. Only for server code that has already
 * done its own authorization: anonymous posting, rate limits, scheduled jobs,
 * audit writes. Never pass its results to the client without filtering.
 */
export function createServiceClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
