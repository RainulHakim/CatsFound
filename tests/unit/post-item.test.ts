import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: { sql: string; params: unknown[] }[] = [];
let failOn: RegExp | null = null;
let refRow = { category: true, building: true };
const stored = new Map<string, Buffer>();
const deleted: string[] = [];

vi.mock("@/lib/db/sql", () => ({
  withActor: async (_a: unknown, fn: (db: unknown) => unknown) =>
    fn({
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (failOn?.test(sql)) throw new Error("db down");
        if (sql.includes("exists(select 1 from public.categories")) return { rows: [refRow] };
        if (sql.includes("photo") && sql.includes("select p.item_id")) {
          return { rows: [{ item_id: "i", storage_path: "items/i/p", variants: [400, 800] }] };
        }
        if (sql.includes("rate_limits_prune")) return { rows: [{ n: 4 }] };
        return { rows: [], rowCount: 2 };
      },
    }),
}));
vi.mock("@/lib/storage", () => ({
  photoStorage: () => ({
    put: async (path: string, data: Buffer) => void stored.set(path, data),
    get: async (path: string) => stored.get(path) ?? null,
    del: async (paths: string[]) => void deleted.push(...paths),
  }),
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { createFoundItem, PostRejected } = await import("@/lib/post-item");
const { decrypt } = await import("@/lib/crypto");
const { encodeCursor, decodeCursor } = await import("@/lib/items");
const { purgeExpired } = await import("@/lib/retention");

const KEY = Buffer.alloc(32, 5).toString("base64");
const input = {
  category: "00000000-0000-4000-8000-000000000001",
  building: "00000000-0000-4000-8000-000000000002",
  description: "Blue bottle",
  secret: "dent on the lid",
  contact: "",
  startedAt: 1_000,
  src: "qr",
};
const photo = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: "#2f6db5" } })
    .jpeg()
    .toBuffer();

beforeEach(() => {
  queries.length = 0;
  stored.clear();
  deleted.length = 0;
  failOn = null;
  refRow = { category: true, building: true };
});

describe("createFoundItem", () => {
  it("stores processed WebP variants and inserts item, private row, photos and the metric", async () => {
    const id = await createFoundItem(input, [await photo()], { encryptionKey: KEY, now: 9_000 });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      [...stored.keys()].every((k) => k.startsWith(`items/${id}/`) && k.endsWith(".webp")),
    ).toBe(true);
    expect([...stored.keys()].map((k) => k.split("_").pop())).toEqual([
      "400.webp",
      "800.webp",
      "900.webp",
    ]);

    const sqls = queries.map((q) => q.sql);
    expect(sqls.some((s) => s.includes("insert into public.items"))).toBe(true);
    expect(sqls.some((s) => s.includes("insert into public.item_photos"))).toBe(true);

    const priv = queries.find((q) => q.sql.includes("insert into public.item_private"))!;
    const secretEnc = priv.params[2] as string;
    expect(secretEnc).not.toContain("dent");
    expect(decrypt(secretEnc, KEY)).toBe("dent on the lid");
    expect(priv.params[1]).toBeNull(); // anonymous finder

    const metric = queries.find((q) => q.sql.includes("metrics_events"))!;
    expect(metric.params[0]).toBe(8_000);
  });

  it("never sends user input into SQL text, only as parameters", async () => {
    await createFoundItem({ ...input, description: "'); drop table items; --" }, [await photo()], {
      encryptionKey: KEY,
    });
    expect(queries.some((q) => q.sql.includes("drop table"))).toBe(false);
  });

  it("skips implausible time-to-post values", async () => {
    await createFoundItem({ ...input, startedAt: 1 }, [await photo()], {
      encryptionKey: KEY,
      now: 60 * 60 * 1000,
    });
    expect(queries.some((q) => q.sql.includes("metrics_events"))).toBe(false);
  });

  it("requires 1–4 photos", async () => {
    await expect(createFoundItem(input, [], { encryptionKey: KEY })).rejects.toBeInstanceOf(
      PostRejected,
    );
    const p = await photo();
    await expect(
      createFoundItem(input, [p, p, p, p, p], { encryptionKey: KEY }),
    ).rejects.toMatchObject({
      detail: { kind: "photos" },
    });
  });

  it("turns a non-image into a friendly photo error and stores nothing", async () => {
    await expect(
      createFoundItem(input, [Buffer.from("<html>not a photo</html>")], { encryptionKey: KEY }),
    ).rejects.toMatchObject({
      detail: { kind: "photos", message: expect.stringMatching(/isn't a photo/) },
    });
    expect(stored.size).toBe(0);
  });

  it("rejects unknown categories/buildings and cleans up uploaded photos", async () => {
    refRow = { category: true, building: false };
    await expect(
      createFoundItem(input, [await photo()], { encryptionKey: KEY }),
    ).rejects.toMatchObject({
      detail: { field: "building" },
    });
    expect(deleted.sort()).toEqual([...stored.keys()].sort());
  });

  it("deletes uploaded photos if the database write fails", async () => {
    failOn = /insert into public.item_photos/;
    await expect(createFoundItem(input, [await photo()], { encryptionKey: KEY })).rejects.toThrow(
      "db down",
    );
    expect(deleted.length).toBe(stored.size);
    expect(deleted.length).toBeGreaterThan(0);
  });
});

describe("browse cursors", () => {
  it("round-trip and reject tampering", () => {
    const c = encodeCursor({
      created_at: "2026-10-18T10:00:00.000Z",
      id: "c54a6f35-0000-4000-8000-000000000000",
    });
    expect(decodeCursor(c)).toEqual({
      created: "2026-10-18T10:00:00.000Z",
      id: "c54a6f35-0000-4000-8000-000000000000",
    });
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("not-base64-at-all")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-10-18|'; drop").toString("base64url"))).toBeNull();
  });
});

describe("purgeExpired", () => {
  it("deletes photos first, then rows older than 90 days, and reports counts", async () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const result = await purgeExpired(now);
    expect(deleted).toEqual(["items/i/p_400.webp", "items/i/p_800.webp"]);
    const cutoff = queries.find((q) => q.sql.includes("delete from public.items"))!
      .params[0] as Date;
    expect(now.getTime() - cutoff.getTime()).toBe(90 * 86_400_000);
    expect(result).toMatchObject({ itemsDeleted: 2, photosDeleted: 2, rateLimitRowsDeleted: 4 });
  });
});
