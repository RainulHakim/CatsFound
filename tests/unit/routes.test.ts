import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.fn();
vi.mock("@/lib/db/sql", () => ({
  withActor: async (actor: unknown, fn: (db: unknown) => unknown) => {
    seenActors.push(actor);
    return fn({ query: dbQuery });
  },
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const purge = vi.fn();
vi.mock("@/lib/retention", () => ({ purgeExpired: () => purge() }));
const seenActors: unknown[] = [];

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
  DATABASE_URL: "postgres://u:p@localhost/db",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  IP_HASH_SALT: "0123456789abcdef",
  CRON_SECRET: "cron-secret-cron-secret",
};
Object.assign(process.env, ENV);
delete process.env.BLOB_READ_WRITE_TOKEN;

// Local storage writes under cwd/.data; point cwd at a temp dir.
const dir = mkdtempSync(join(tmpdir(), "catfound-"));
vi.spyOn(process, "cwd").mockReturnValue(dir);
const { photoStorage } = await import("@/lib/storage");
const photoRoute = await import("@/app/api/photos/[id]/[width]/route");
const cronRoute = await import("@/app/api/cron/purge/route");
const items = await import("@/lib/items");

const PHOTO = "11111111-1111-4111-8111-111111111111";
const ctx = (id: string, width: string) => ({ params: Promise.resolve({ id, width }) }) as never;

beforeEach(() => {
  dbQuery.mockReset();
  seenActors.length = 0;
  purge.mockReset();
});

describe("local photo storage", () => {
  it("round-trips, deletes, and refuses path traversal", async () => {
    const s = photoStorage();
    await s.put("items/a/b_400.webp", Buffer.from("x"), "image/webp");
    expect((await s.get("items/a/b_400.webp"))?.toString()).toBe("x");
    await s.del(["items/a/b_400.webp"]);
    expect(await s.get("items/a/b_400.webp")).toBeNull();
    await expect(s.put("../../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /invalid/,
    );
  });
});

describe("GET /api/photos/[id]/[width]", () => {
  it("serves an allowed photo variant as WebP", async () => {
    await photoStorage().put(`items/i/${PHOTO}_400.webp`, Buffer.from("webp-bytes"), "image/webp");
    dbQuery.mockResolvedValueOnce({
      rows: [{ storage_path: `items/i/${PHOTO}`, variants: [400, 800] }],
    });
    const res = await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "400"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("webp-bytes");
    expect(seenActors).toEqual([{ kind: "anon" }]);
  });

  it("404s for sensitive/claimed items (the DB returns nothing)", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    expect((await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "400"))).status).toBe(404);
  });

  it("404s for sizes that were never generated and for bad ids", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ storage_path: "items/i/p", variants: [400] }] });
    expect((await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "1600"))).status).toBe(404);
    expect((await photoRoute.GET(new Request("http://x"), ctx("../etc", "400"))).status).toBe(404);
    expect((await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "abc"))).status).toBe(404);
  });

  it("404s when the object is missing and 500s on database failure", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ storage_path: "items/none/p", variants: [400] }] });
    expect((await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "400"))).status).toBe(404);
    dbQuery.mockRejectedValueOnce(new Error("db down"));
    expect((await photoRoute.GET(new Request("http://x"), ctx(PHOTO, "400"))).status).toBe(500);
  });
});

describe("GET /api/cron/purge", () => {
  const call = (auth?: string) =>
    cronRoute.GET(
      new Request("http://x/api/cron/purge", { headers: auth ? { authorization: auth } : {} }),
    );

  it("requires the cron secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(purge).not.toHaveBeenCalled();
  });

  it("runs the purge and reports counts", async () => {
    purge.mockResolvedValueOnce({ itemsDeleted: 1 });
    const res = await call(`Bearer ${ENV.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ itemsDeleted: 1 });
  });

  it("returns 500 without details when the purge fails", async () => {
    purge.mockRejectedValueOnce(new Error("secret internals"));
    const res = await call(`Bearer ${ENV.CRON_SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("internals");
  });
});

describe("item queries", () => {
  it("read reference data and items as anon", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "x" }] });
    await items.listCategories();
    await items.listBuildings();
    await items.listDropOffPoints();
    expect(await items.getItem("x")).toEqual({ id: "x" });
    expect(await items.photoObject("x")).toEqual({ id: "x" });
    expect(seenActors.every((a) => (a as { kind: string }).kind === "anon")).toBe(true);
  });

  it("returns null for missing items", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await items.getItem("x")).toBeNull();
    expect(await items.photoObject("x")).toBeNull();
  });

  it("browse asks for one extra row to know whether there is a next page", async () => {
    const row = (i: number) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      created_at: "2026-10-18T00:00:00Z",
    });
    dbQuery.mockResolvedValueOnce({
      rows: Array.from({ length: items.PAGE_SIZE + 1 }, (_, i) => row(i)),
    });
    const page = await items.browseItems({ q: "bottle" });
    expect(page.items).toHaveLength(items.PAGE_SIZE);
    expect(items.decodeCursor(page.nextCursor!)?.id).toBe(row(items.PAGE_SIZE - 1).id);
    const params = dbQuery.mock.calls[0]![1] as unknown[];
    expect(params[4]).toBe("bottle");
    expect(params[7]).toBe(items.PAGE_SIZE + 1);

    dbQuery.mockResolvedValueOnce({ rows: [row(1)] });
    expect((await items.browseItems({})).nextCursor).toBeNull();
  });
});

describe("format helpers", async () => {
  const f = await import("@/lib/format");
  it("formats calendar dates without timezone drift", () => {
    expect(f.formatFoundDate("2026-10-12")).toBe("Oct 12");
    expect(f.formatFoundDate(new Date("2026-01-01T00:00:00Z"))).toBe("Jan 1");
  });
  it("builds alt text from colour, category and building", () => {
    expect(
      f.photoAlt({
        category_name: "Water bottle",
        color_tags: ["Black"],
        building_name: "Chambers",
      }),
    ).toBe("Black water bottle found in Chambers");
    expect(
      f.photoAlt({ category_name: "Jacket / coat", color_tags: [], building_name: "Wall" }),
    ).toBe("Jacket found in Wall");
  });
  it("picks a/an and builds srcsets", () => {
    expect(f.article("ID card")).toBe("An");
    expect(f.article("wallet")).toBe("A");
    expect(f.photoSrcSet("p", [400, 800])).toBe("/api/photos/p/400 400w, /api/photos/p/800 800w");
  });
});

describe("found-item validation", async () => {
  const { foundItemSchema, browseQuerySchema, dropOffSchema } =
    await import("@/lib/validation/found-item");
  const ok = {
    category: "00000000-0000-4000-8000-000000000001",
    building: "00000000-0000-4000-8000-000000000002",
  };

  it("requires category and building, trims and defaults the rest", () => {
    expect(foundItemSchema.parse({ ...ok, description: "  hi " })).toMatchObject({
      description: "hi",
      secret: "",
      contact: "",
    });
    const r = foundItemSchema.safeParse({ category: "nope", building: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual([
      "Pick what kind of thing it is.",
      "Pick where you found it.",
    ]);
  });

  it("caps lengths and checks the optional email", () => {
    expect(foundItemSchema.safeParse({ ...ok, description: "x".repeat(501) }).success).toBe(false);
    expect(foundItemSchema.safeParse({ ...ok, secret: "x".repeat(201) }).success).toBe(false);
    expect(foundItemSchema.safeParse({ ...ok, contact: "not-an-email" }).success).toBe(false);
  });

  it("drops junk telemetry instead of failing the post", () => {
    expect(foundItemSchema.parse({ ...ok, startedAt: "abc", src: "<script>" })).toMatchObject({
      startedAt: undefined,
      src: undefined,
    });
  });

  it("ignores malformed browse filters rather than erroring", () => {
    expect(browseQuerySchema.parse({ category: "x", from: "yesterday", q: "bottle" })).toEqual({
      category: undefined,
      from: undefined,
      q: "bottle",
    });
  });

  it("validates drop-off choices", () => {
    expect(
      dropOffSchema.safeParse({ item: ok.category, token: "a".repeat(32), dropOff: ok.building })
        .success,
    ).toBe(true);
    expect(
      dropOffSchema.safeParse({ item: ok.category, token: "short", dropOff: ok.building }).success,
    ).toBe(false);
  });
});
