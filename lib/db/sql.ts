import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * Postgres access. Every call runs in a transaction as an explicit actor:
 *   - "anon":    SET LOCAL ROLE anon, so RLS and grants apply.
 *   - "service": the database owner. Only for server code that has already
 *                done its own validation and authorization (posting, jobs).
 * Parameterized queries only.
 */

export type Actor = { kind: "anon" } | { kind: "service" };

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function withActor<T>(actor: Actor, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    if (actor.kind === "anon") {
      await client.query("set local role anon");
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
