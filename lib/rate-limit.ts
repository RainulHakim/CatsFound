import "server-only";
import { withActor } from "@/lib/db/sql";
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
  try {
    return await withActor({ kind: "service" }, async (db) => {
      const { rows } = await db.query<{ ok: boolean }>(
        "select public.rate_limit_hit($1, $2, $3) as ok",
        [key, windowSeconds, max],
      );
      return rows[0]?.ok === true;
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err), key: key.split(":")[0] },
      "rate limiter unavailable",
    );
    return false;
  }
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
