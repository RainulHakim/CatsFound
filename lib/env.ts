import { z } from "zod";

/**
 * Environment validation. Parsed lazily on first access so a missing
 * server-only secret fails loudly at the first request that needs it,
 * not at import time in code paths (and builds) that never touch it.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(20),
  APP_ENCRYPTION_KEY: base64Key32,
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  SENTRY_DSN: z.url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) throw new Error(`Invalid public environment: ${format(result.error)}`);
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) throw new Error(`Invalid server environment: ${format(result.error)}`);
  return result.data;
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

export function publicEnv(): PublicEnv {
  // Next.js inlines NEXT_PUBLIC_* only when referenced literally.
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cachedPublic;
}

export function serverEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
