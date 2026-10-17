import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createItem, createUser, errorAs, type Db } from "./harness";

let db: Db;
let alice: { id: string; email: string };
let bob: { id: string; email: string };
let staff: { id: string; email: string };
let admin: { id: string; email: string };
let openItem: string;
let sensitiveItem: string;
let alicesSensitiveItem: string;
let claimedItem: string;

const ANON = { kind: "anon" } as const;
const user = (u: { id: string }) => ({ kind: "user", id: u.id }) as const;

beforeAll(async () => {
  db = await createDb();
  alice = await createUser(db);
  bob = await createUser(db);
  staff = await createUser(db, { role: "staff" });
  admin = await createUser(db, { role: "admin" });
  openItem = await createItem(db);
  sensitiveItem = await createItem(db, { categorySlug: "wallet" });
  alicesSensitiveItem = await createItem(db, { categorySlug: "phone", postedBy: alice.id });
  claimedItem = await createItem(db, { status: "claimed" });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("seed", () => {
  it("has the campus, ~20 categories with the 10 sensitive ones, buildings and drop-off points", async () => {
    const [counts] = await db.query<{ c: number; s: number; b: number; d: number }>(`
      select
        (select count(*)::int from public.categories) as c,
        (select count(*)::int from public.categories where is_sensitive) as s,
        (select count(*)::int from public.buildings) as b,
        (select count(*)::int from public.drop_off_points) as d`);
    expect(counts!.c).toBeGreaterThanOrEqual(20);
    expect(counts!.s).toBe(10);
    expect(counts!.b).toBeGreaterThanOrEqual(25);
    expect(counts!.d).toBe(3);
  });

  it("lets only the Union desk accept sensitive items", async () => {
    const rows = await db.query<{ slug: string }>(
      "select slug from public.drop_off_points where accepts_sensitive",
    );
    expect(rows.map((r) => r.slug)).toEqual(["union-desk"]);
  });
});

describe("auth.users domain enforcement", () => {
  it("rejects non-Davidson addresses", async () => {
    await expect(
      db.query("insert into auth.users (email) values ('someone@gmail.com')"),
    ).rejects.toThrow(/davidson\.edu/);
  });

  it("rejects look-alike domains and plus-addressing", async () => {
    for (const email of [
      "a@davidson.edu.evil.com",
      "a@notdavidson.edu",
      "a+alt@davidson.edu",
      "a@sub.davidson.edu",
    ]) {
      await expect(db.query("insert into auth.users (email) values ($1)", [email])).rejects.toThrow();
    }
  });

  it("rejects changing an existing account to an outside address", async () => {
    await expect(
      db.query("update auth.users set email = 'x@gmail.com' where id = $1", [alice.id]),
    ).rejects.toThrow(/davidson\.edu/);
  });

  it("creates a lower-cased student profile on sign-up", async () => {
    const u = await createUser(db, { email: "MixedCase.Name@Davidson.edu" });
    const [row] = await db.query<{ email: string; role: string }>(
      "select email, role from public.users where id = $1",
      [u.id],
    );
    expect(row).toEqual({ email: "mixedcase.name@davidson.edu", role: "student" });
  });
});

describe("reference data", () => {
  it("is readable by anon (the anonymous post form needs it)", async () => {
    const rows = await as(db, ANON, "select id from public.buildings limit 1");
    expect(rows).toHaveLength(1);
  });

  it("is not writable by anyone but the service role", async () => {
    for (const actor of [ANON, user(alice), user(staff)]) {
      expect(await errorAs(db, actor, "delete from public.categories")).toMatch(/permission denied/);
      expect(
        await errorAs(db, actor, "update public.buildings set name = 'x'"),
      ).toMatch(/permission denied/);
    }
  });
});

describe("users", () => {
  it("a student sees only their own profile", async () => {
    const rows = await as<{ id: string }>(db, user(alice), "select id from public.users");
    expect(rows.map((r) => r.id)).toEqual([alice.id]);
  });

  it("someone else's profile is invisible and unchangeable", async () => {
    const rows = await as(db, user(alice), "select id from public.users where id = $1", [bob.id]);
    expect(rows).toHaveLength(0);
    const updated = await as(
      db,
      user(alice),
      "update public.users set display_name = 'pwned' where id = $1 returning id",
      [bob.id],
    );
    expect(updated).toHaveLength(0);
  });

  it("a student cannot promote themselves", async () => {
    expect(
      await errorAs(db, user(alice), "update public.users set role = 'admin' where id = $1", [alice.id]),
    ).toMatch(/permission denied/);
  });

  it("a student can edit their own display name", async () => {
    const rows = await as(
      db,
      user(alice),
      "update public.users set display_name = 'Alice' where id = $1 returning id",
      [alice.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("staff can read profiles", async () => {
    const rows = await as(db, user(staff), "select id from public.users where id = $1", [bob.id]);
    expect(rows).toHaveLength(1);
  });

  it("anon can read nothing", async () => {
    expect(await errorAs(db, ANON, "select id from public.users")).toMatch(/permission denied/);
  });
});

describe("items", () => {
  it("anon cannot read the item index", async () => {
    expect(await errorAs(db, ANON, "select id from public.items")).toMatch(/permission denied/);
  });

  it("a student sees open non-sensitive items only", async () => {
    const rows = await as<{ id: string }>(db, user(bob), "select id from public.items");
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(openItem);
    expect(ids).not.toContain(sensitiveItem);
    expect(ids).not.toContain(alicesSensitiveItem);
    expect(ids).not.toContain(claimedItem);
  });

  it("the finder sees their own sensitive item; staff see everything", async () => {
    const mine = await as(db, user(alice), "select id from public.items where id = $1", [
      alicesSensitiveItem,
    ]);
    expect(mine).toHaveLength(1);
    const all = await as<{ id: string }>(db, user(staff), "select id from public.items");
    expect(all.map((r) => r.id)).toEqual(
      expect.arrayContaining([openItem, sensitiveItem, alicesSensitiveItem, claimedItem]),
    );
  });

  it("is_sensitive is derived from the category and cannot be forged", async () => {
    const [row] = await as<{ is_sensitive: boolean }>(
      db,
      { kind: "service" },
      `insert into public.items (category_id, building_id, is_sensitive)
       values ((select id from public.categories where slug = 'keys'),
               (select id from public.buildings where slug = 'chambers'), false)
       returning is_sensitive`,
    );
    expect(row!.is_sensitive).toBe(true);
  });

  it("sensitive items cannot be routed to a drop-off point that doesn't accept them", async () => {
    const err = await errorAs(
      db,
      { kind: "service" },
      `insert into public.items (category_id, building_id, drop_off_point_id)
       values ((select id from public.categories where slug = 'wallet'),
               (select id from public.buildings where slug = 'chambers'),
               (select id from public.drop_off_points where slug = 'chambers'))`,
    );
    expect(err).toMatch(/drop-off point/);
  });

  it("students cannot insert, update or delete items directly", async () => {
    expect(
      await errorAs(
        db,
        user(bob),
        `insert into public.items (category_id, building_id)
         values ((select id from public.categories limit 1), (select id from public.buildings limit 1))`,
      ),
    ).toMatch(/permission denied|row-level security/);
    const updated = await as(
      db,
      user(bob),
      "update public.items set description = 'x' where id = $1 returning id",
      [openItem],
    );
    expect(updated).toHaveLength(0);
    expect(await errorAs(db, user(bob), "delete from public.items")).toMatch(/permission denied/);
  });

  it("staff can update items", async () => {
    const updated = await as(
      db,
      user(staff),
      "update public.items set status = 'archived' where id = $1 returning id",
      [openItem],
    );
    expect(updated).toHaveLength(1);
  });
});

describe("item_private (finder identity + verification secret)", () => {
  it("is invisible to other students, even for open items", async () => {
    const rows = await as(db, user(bob), "select * from public.item_private");
    expect(rows).toHaveLength(0);
  });

  it("is visible to the finder for their own item, and to staff", async () => {
    const mine = await as<{ item_id: string }>(
      db,
      user(alice),
      "select item_id from public.item_private",
    );
    expect(mine.map((r) => r.item_id)).toEqual([alicesSensitiveItem]);
    const all = await as(db, user(staff), "select item_id from public.item_private");
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("anon has no access", async () => {
    expect(await errorAs(db, ANON, "select * from public.item_private")).toMatch(/permission denied/);
  });
});

describe("item_photos", () => {
  it("follow item visibility: no photos of sensitive items for students", async () => {
    const rows = await as<{ item_id: string }>(db, user(bob), "select item_id from public.item_photos");
    const ids = rows.map((r) => r.item_id);
    expect(ids).toContain(openItem);
    expect(ids).not.toContain(sensitiveItem);
    expect(ids).not.toContain(alicesSensitiveItem);
  });

  it("staff see photos of sensitive items", async () => {
    const rows = await as(db, user(staff), "select 1 from public.item_photos where item_id = $1", [
      sensitiveItem,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("lost reports", () => {
  const insertReport = (userId: string) =>
    `insert into public.lost_reports (user_id, category_id, lost_after, lost_before)
     values ('${userId}', (select id from public.categories where slug = 'keys'), current_date - 3, current_date)
     returning id`;

  it("a student can file their own", async () => {
    const rows = await as(db, user(alice), insertReport(alice.id));
    expect(rows).toHaveLength(1);
  });

  it("a student cannot file one as someone else", async () => {
    expect(await errorAs(db, user(alice), insertReport(bob.id))).toMatch(/row-level security/);
  });

  it("someone else's report is invisible", async () => {
    const [report] = await db.query<{ id: string }>(insertReport(alice.id));
    const rows = await as(db, user(bob), "select id from public.lost_reports where id = $1", [
      report!.id,
    ]);
    expect(rows).toHaveLength(0);
    const own = await as(db, user(alice), "select id from public.lost_reports where id = $1", [
      report!.id,
    ]);
    expect(own).toHaveLength(1);
  });

  it("anon has no access", async () => {
    expect(await errorAs(db, ANON, "select id from public.lost_reports")).toMatch(
      /permission denied/,
    );
  });
});

describe("matches", () => {
  it("are visible and dismissable only by the report owner", async () => {
    const [report] = await db.query<{ id: string }>(
      `insert into public.lost_reports (user_id, category_id, lost_after, lost_before)
       values ($1, (select id from public.categories where slug = 'water-bottle'), current_date - 1, current_date)
       returning id`,
      [alice.id],
    );
    const [match] = await db.query<{ id: string }>(
      `insert into public.matches (lost_report_id, item_id, score, tier)
       values ($1, $2, 0.9, 0) returning id`,
      [report!.id, openItem],
    );
    expect(await as(db, user(bob), "select id from public.matches where id = $1", [match!.id])).toHaveLength(0);
    expect(
      await as(db, user(bob), "update public.matches set dismissed_at = now() where id = $1 returning id", [
        match!.id,
      ]),
    ).toHaveLength(0);
    expect(
      await as(db, user(alice), "update public.matches set dismissed_at = now() where id = $1 returning id", [
        match!.id,
      ]),
    ).toHaveLength(1);
    expect(
      await errorAs(db, user(alice), "update public.matches set score = 1 where id = $1", [match!.id]),
    ).toMatch(/permission denied/);
  });
});

describe("claims", () => {
  it("students cannot insert claims directly (server-mediated)", async () => {
    expect(
      await errorAs(
        db,
        user(bob),
        "insert into public.claims (item_id, claimant_id) values ($1, $2)",
        [openItem, bob.id],
      ),
    ).toMatch(/permission denied/);
  });

  it("someone else's claim is invisible; staff can see and review it", async () => {
    const [claim] = await db.query<{ id: string }>(
      "insert into public.claims (item_id, claimant_id) values ($1, $2) returning id",
      [openItem, alice.id],
    );
    expect(await as(db, user(bob), "select id from public.claims where id = $1", [claim!.id])).toHaveLength(0);
    expect(await as(db, user(alice), "select id from public.claims where id = $1", [claim!.id])).toHaveLength(1);
    expect(
      await as(db, user(alice), "update public.claims set status = 'approved' where id = $1 returning id", [
        claim!.id,
      ]),
    ).toHaveLength(0);
    expect(
      await as(db, user(staff), "update public.claims set status = 'approved' where id = $1 returning id", [
        claim!.id,
      ]),
    ).toHaveLength(1);
  });
});

describe("audit log", () => {
  it("is readable by admins only", async () => {
    await db.query(
      "insert into public.audit_log (actor_id, action, entity_type) values ($1, 'test', 'item')",
      [staff.id],
    );
    expect(await as(db, user(alice), "select id from public.audit_log")).toHaveLength(0);
    expect(await as(db, user(staff), "select id from public.audit_log")).toHaveLength(0);
    expect((await as(db, user(admin), "select id from public.audit_log")).length).toBeGreaterThan(0);
    expect(await errorAs(db, user(admin), "delete from public.audit_log")).toMatch(/permission denied/);
  });
});

describe("internal tables", () => {
  it("rate_limits and metrics_events are closed to anon and users", async () => {
    for (const actor of [ANON, user(alice), user(admin)]) {
      expect(await errorAs(db, actor, "select * from public.rate_limits")).toMatch(/permission denied/);
      expect(await errorAs(db, actor, "select * from public.metrics_events")).toMatch(
        /permission denied/,
      );
    }
  });

  it("rate_limit_hit is callable only by the service role, and enforces the max", async () => {
    expect(
      await errorAs(db, user(alice), "select public.rate_limit_hit('k', 60, 1)"),
    ).toMatch(/permission denied/);
    const key = `test:${Date.now()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const [row] = await db.query<{ ok: boolean }>(
        "select public.rate_limit_hit($1, 900, 3) as ok",
        [key],
      );
      results.push(row!.ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("every public table has RLS enabled", () => {
  it("no table is left open", async () => {
    const rows = await db.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });
});
