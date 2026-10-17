/**
 * Database test harness. Runs the same RLS tests against either:
 *   - PGlite (in-process Postgres, default; no Docker needed), with minimal
 *     stand-ins for the Supabase `auth` and `storage` schemas, or
 *   - a real Supabase Postgres (DB_TARGET=pg, DATABASE_URL=...), as in CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export type Actor = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

// Minimal emulation of what Supabase provisions before our migrations run.
const SUPABASE_STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists extensions;
  create schema if not exists auth;
  create schema if not exists storage;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase grants table privileges to these roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
}

function seedSql(): string {
  return readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8");
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const sql of migrationFiles()) {
    // pgvector is not available in PGlite; nothing uses it before Phase 4.
    await pg.exec(sql.replace(/^create extension if not exists vector.*$/m, ""));
  }
  await pg.exec(`grant all on all tables in schema public to service_role;`);
  await pg.exec(seedSql());
  return {
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    },
    close: () => pg.close(),
  };
}

async function createPg(): Promise<Db> {
  const { Client } = await import("pg");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when DB_TARGET=pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  return {
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      const res = await client.query(sql, params);
      return res.rows as T[];
    },
    close: () => client.end(),
  };
}

export async function createDb(): Promise<Db> {
  return process.env.DB_TARGET === "pg" ? createPg() : createPglite();
}

/**
 * Run `sql` as the given actor inside a transaction that is always rolled back,
 * so tests never leak state into each other.
 */
export async function as<T extends Row = Row>(
  db: Db,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query("begin");
  try {
    if (actor.kind === "anon") {
      await db.query("select set_config('request.jwt.claim.sub', '', true)");
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
      await db.query("set local role anon");
    } else if (actor.kind === "user") {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.id]);
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated" }),
      ]);
      await db.query("set local role authenticated");
    } else {
      await db.query("set local role service_role");
    }
    return await db.query<T>(sql, params);
  } finally {
    await db.query("rollback");
  }
}

/** Run as the actor and return the error message, or null if it succeeded. */
export async function errorAs(
  db: Db,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  try {
    await as(db, actor, sql, params);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Create an auth user (and, via trigger, a profile row). Committed. */
export async function createUser(
  db: Db,
  opts: { email?: string; role?: "student" | "staff" | "admin" } = {},
): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `t${randomUUID().slice(0, 8)}@davidson.edu`;
  const [row] = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email],
  );
  const id = row!.id;
  if (opts.role && opts.role !== "student") {
    await db.query("update public.users set role = $2 where id = $1", [id, opts.role]);
  }
  return { id, email: email.toLowerCase() };
}

/** Insert a found item as the service role (the posting path). Committed. */
export async function createItem(
  db: Db,
  opts: { categorySlug?: string; postedBy?: string | null; status?: string } = {},
): Promise<string> {
  const [item] = await db.query<{ id: string }>(
    `insert into public.items (category_id, building_id, description, status)
     values (
       (select id from public.categories where slug = $1),
       (select id from public.buildings where slug = 'chambers'),
       'test item', $2::public.item_status
     ) returning id`,
    [opts.categorySlug ?? "water-bottle", opts.status ?? "open"],
  );
  const id = item!.id;
  await db.query(
    `insert into public.item_private (item_id, posted_by, verification_secret_enc)
     values ($1, $2, 'enc:secret')`,
    [id, opts.postedBy ?? null],
  );
  await db.query(
    `insert into public.item_photos (item_id, storage_path, variants, width, height, blurhash)
     values ($1::uuid, 'items/' || $1::text || '/p0', '{400}', 400, 300, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj')`,
    [id],
  );
  return id;
}
