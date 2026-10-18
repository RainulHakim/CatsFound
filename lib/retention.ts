import "server-only";
import { withActor } from "@/lib/db/sql";
import { photoStorage } from "@/lib/storage";

export const RETENTION_DAYS = 90;

/**
 * SPEC §10.4: items (and their photos) are purged 90 days after they reach
 * collected/archived; lost reports expire; audit log kept one year; old
 * rate-limit windows are pruned. Safe to run repeatedly.
 */
export async function purgeExpired(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  const doomed = await withActor({ kind: "service" }, async (db) => {
    const { rows } = await db.query<{ item_id: string; storage_path: string; variants: number[] }>(
      `select p.item_id, p.storage_path, p.variants
       from public.items i join public.item_photos p on p.item_id = i.id
       where i.status in ('collected', 'archived')
         and coalesce(i.collected_at, i.archived_at, i.updated_at) < $1`,
      [cutoff],
    );
    return rows;
  });

  // Photos first: if this fails, the rows stay and the next run retries.
  const keys = doomed.flatMap((p) => p.variants.map((w) => `${p.storage_path}_${w}.webp`));
  for (let i = 0; i < keys.length; i += 100) {
    await photoStorage().del(keys.slice(i, i + 100));
  }

  return withActor({ kind: "service" }, async (db) => {
    const items = await db.query(
      `delete from public.items
       where status in ('collected', 'archived')
         and coalesce(collected_at, archived_at, updated_at) < $1`,
      [cutoff],
    );
    const reports = await db.query(
      `update public.lost_reports set status = 'expired'
       where status = 'active' and expires_at < $1`,
      [now],
    );
    const audit = await db.query(
      `delete from public.audit_log where created_at < $1::timestamptz - interval '1 year'`,
      [now],
    );
    const limits = await db.query<{ n: number }>("select public.rate_limits_prune() as n");
    return {
      itemsDeleted: items.rowCount ?? 0,
      photosDeleted: keys.length,
      lostReportsExpired: reports.rowCount ?? 0,
      auditRowsDeleted: audit.rowCount ?? 0,
      rateLimitRowsDeleted: limits.rows[0]?.n ?? 0,
    };
  });
}
