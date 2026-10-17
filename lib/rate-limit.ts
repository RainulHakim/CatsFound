import "server-only";
import { createServiceClient } from "@/lib/db/server";
import { log } from "@/lib/log";

/** Returns true when the hit is allowed. */
export type Limiter = (key: string, windowSeconds: number, max: number) => Promise<boolean>;

export type Limit = { windowSeconds: number; max: number };

/** SPEC §9 and §10.1. */
export const LIMITS = {
  signInPerEmail: { windowSeconds: 15 * 60, max: 3 },
  signInPerIp: { windowSeconds: 60 * 60, max: 10 },
  verifyPerEmail: { windowSeconds: 15 * 60, max: 10 },
  postItemPerIp: { windowSeconds: 60 * 60, max: 5 },
  claimPerUser: { windowSeconds: 24 * 60 * 60, max: 10 },
  searchPerUser: { windowSeconds: 60, max: 60 },
} as const satisfies Record<string, Limit>;

/** Postgres-backed limiter (public.rate_limit_hit). Fails closed. */
export const dbLimiter: Limiter = async (key, windowSeconds, max) => {
  const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    log.error({ err: error.message, key: key.split(":")[0] }, "rate limiter unavailable");
    return false;
  }
  return data === true;
};

/** Every check is counted; the request is allowed only if all pass. */
export async function allow(
  limiter: Limiter,
  checks: { key: string; limit: Limit }[],
): Promise<boolean> {
  const results = await Promise.all(
    checks.map((c) => limiter(c.key, c.limit.windowSeconds, c.limit.max)),
  );
  return results.every(Boolean);
}
