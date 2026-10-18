// Applies db/bootstrap.sql, then any new supabase/migrations/*.sql, then the
// idempotent seed, to the Postgres in DATABASE_URL_UNPOOLED (or DATABASE_URL).
// Usage: node scripts/db-migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}

const root = new URL("..", import.meta.url).pathname;
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(readFileSync(join(root, "db", "bootstrap.sql"), "utf8"));
  const applied = new Set(
    (await client.query("select version from app_meta.schema_migrations")).rows.map(
      (r) => r.version,
    ),
  );
  const dir = join(root, "supabase", "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const version = file.split("_")[0];
    if (applied.has(version)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into app_meta.schema_migrations (version) values ($1)", [version]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file}: ${err.message}`);
    }
  }
  await client.query(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  const { rows } = await client.query(
    "select (select count(*) from public.categories)::int c, (select count(*) from public.buildings)::int b",
  );
  console.log(`seed ok: ${rows[0].c} categories, ${rows[0].b} buildings`);
} finally {
  await client.end();
}
