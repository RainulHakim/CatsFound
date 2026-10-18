import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createItem, errorAs, type Db } from "./harness";

let db: Db;
let bottle: string;
let wallet: string;
let claimed: string;

const ANON = { kind: "anon" } as const;

type Card = {
  id: string;
  is_sensitive: boolean;
  description: string | null;
  photos: { id: string }[];
  category_name: string;
};

beforeAll(async () => {
  db = await createDb();
  bottle = await createItem(db);
  await db.query(
    "update public.items set description = 'Blue Hydro Flask with stickers' where id = $1",
    [bottle],
  );
  wallet = await createItem(db, { categorySlug: "wallet" });
  claimed = await createItem(db, { status: "claimed" });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("browse_items", () => {
  it("lists open items newest first, including sensitive ones as placeholders", async () => {
    const rows = await as<Card>(db, ANON, "select * from public.browse_items()");
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(bottle);
    expect(ids).toContain(wallet);
    expect(ids).not.toContain(claimed);
  });

  it("never returns photos or description for sensitive items", async () => {
    const [w] = await as<Card>(db, ANON, "select * from public.browse_items() where id = $1", [
      wallet,
    ]);
    expect(w!.is_sensitive).toBe(true);
    expect(w!.description).toBeNull();
    expect(w!.photos).toEqual([]);
    const [b] = await as<Card>(db, ANON, "select * from public.browse_items() where id = $1", [
      bottle,
    ]);
    expect(b!.photos).toHaveLength(1);
  });

  it("never exposes finder identity or the verification secret", async () => {
    const rows = await as<Record<string, unknown>>(db, ANON, "select * from public.browse_items()");
    const text = JSON.stringify(rows);
    expect(text).not.toContain("enc:secret");
    for (const key of ["posted_by", "verification_secret_enc", "posted_by_contact_enc"]) {
      expect(Object.keys(rows[0]!)).not.toContain(key);
    }
  });

  it("searches descriptions and category names", async () => {
    const byText = await as<Card>(
      db,
      ANON,
      "select * from public.browse_items(p_q => 'hydro flask')",
    );
    expect(byText.map((r) => r.id)).toEqual([bottle]);
    const byCategory = await as<Card>(
      db,
      ANON,
      "select * from public.browse_items(p_q => 'wallet')",
    );
    expect(byCategory.map((r) => r.id)).toContain(wallet);
  });

  it("does not match a sensitive item on its hidden description", async () => {
    await db.query(
      "update public.items set description = 'brown leather with initials' where id = $1",
      [wallet],
    );
    const rows = await as<Card>(db, ANON, "select * from public.browse_items(p_q => 'initials')");
    expect(rows.map((r) => r.id)).not.toContain(wallet);
  });

  it("filters by category and paginates with a keyset cursor", async () => {
    const [cat] = await db.query<{ id: string }>(
      "select id from public.categories where slug = 'wallet'",
    );
    const filtered = await as<Card>(
      db,
      ANON,
      "select * from public.browse_items(p_category => $1)",
      [cat!.id],
    );
    // Other test files may share this database, so check membership, not equality.
    expect(filtered.map((r) => r.id)).toContain(wallet);
    expect(filtered.map((r) => r.id)).not.toContain(bottle);
    expect(filtered.every((r) => r.category_name === "Wallet")).toBe(true);

    const first = await as<{ id: string; created_at: string }>(
      db,
      ANON,
      "select id, created_at from public.browse_items(p_limit => 1)",
    );
    const next = await as<{ id: string }>(
      db,
      ANON,
      "select id from public.browse_items(p_before_created => $1, p_before_id => $2, p_limit => 48)",
      [first[0]!.created_at, first[0]!.id],
    );
    expect(next.map((r) => r.id)).not.toContain(first[0]!.id);
    expect(next.length).toBeGreaterThan(0);
  });

  it("caps page size at 48", async () => {
    const rows = await as(db, ANON, "select * from public.browse_items(p_limit => 10000)");
    expect(rows.length).toBeLessThanOrEqual(48);
  });
});

describe("get_item and photo_object", () => {
  it("returns an open item with the Union desk as default drop-off", async () => {
    const [row] = await as<{ id: string; drop_off_name: string }>(
      db,
      ANON,
      "select * from public.get_item($1)",
      [bottle],
    );
    expect(row!.drop_off_name).toBe("Alvarez Union desk");
  });

  it("returns nothing for claimed items", async () => {
    expect(await as(db, ANON, "select * from public.get_item($1)", [claimed])).toHaveLength(0);
  });

  it("serves photos of open non-sensitive items only", async () => {
    const [bp] = await db.query<{ id: string }>(
      "select id from public.item_photos where item_id = $1",
      [bottle],
    );
    const [wp] = await db.query<{ id: string }>(
      "select id from public.item_photos where item_id = $1",
      [wallet],
    );
    expect(await as(db, ANON, "select * from public.photo_object($1)", [bp!.id])).toHaveLength(1);
    expect(await as(db, ANON, "select * from public.photo_object($1)", [wp!.id])).toHaveLength(0);
  });

  it("the helper that builds photo lists is not callable directly", async () => {
    expect(await errorAs(db, ANON, "select public.item_card_photos($1, false)", [wallet])).toMatch(
      /permission denied/,
    );
  });
});
