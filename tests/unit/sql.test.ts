import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const release = vi.fn();
const client = {
  query: vi.fn(async (sql: string) => {
    calls.push(sql);
    return { rows: [] };
  }),
  release,
};
vi.mock("pg", () => ({
  Pool: class {
    connect = async () => client;
  },
}));

process.env.DATABASE_URL = "postgres://u:p@localhost/db";
const { withActor } = await import("@/lib/db/sql");

beforeEach(() => {
  calls.length = 0;
  release.mockClear();
});

describe("withActor", () => {
  it("runs anon work inside a transaction as the anon role, so RLS applies", async () => {
    await withActor({ kind: "anon" }, (db) => db.query("select 1"));
    expect(calls).toEqual(["begin", "set local role anon", "select 1", "commit"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("runs service work as the owner, without switching role", async () => {
    await withActor({ kind: "service" }, (db) => db.query("insert"));
    expect(calls).toEqual(["begin", "insert", "commit"]);
  });

  it("rolls back and releases the connection on error", async () => {
    await expect(
      withActor({ kind: "anon" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toEqual(["begin", "set local role anon", "rollback"]);
    expect(release).toHaveBeenCalledOnce();
  });
});
