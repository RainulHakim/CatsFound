import { describe, expect, it, vi } from "vitest";
import { davidsonEmail, verifyCodeSchema, verifyLinkSchema } from "@/lib/validation/auth";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

vi.mock("@/lib/db/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

describe("davidsonEmail", () => {
  it("accepts and normalises Davidson addresses", () => {
    expect(davidsonEmail.parse("  Jane.Doe@Davidson.EDU ")).toBe("jane.doe@davidson.edu");
  });

  it.each([
    "jane@gmail.com",
    "jane@davidson.edu.evil.com",
    "jane@notdavidson.edu",
    "jane+alt@davidson.edu",
    "jane@sub.davidson.edu",
    "@davidson.edu",
    "",
  ])("rejects %j", (email) => {
    expect(davidsonEmail.safeParse(email).success).toBe(false);
  });

  it("gives a human message for the wrong domain", () => {
    const r = davidsonEmail.safeParse("jane@gmail.com");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Use your @davidson.edu email address.");
  });
});

describe("verifyCodeSchema", () => {
  it("requires exactly six digits", () => {
    expect(verifyCodeSchema.safeParse({ email: "a@davidson.edu", code: "123456" }).success).toBe(
      true,
    );
    expect(verifyCodeSchema.safeParse({ email: "a@davidson.edu", code: " 123456 " }).success).toBe(
      true,
    );
    for (const code of ["12345", "1234567", "abcdef", "12 456"]) {
      expect(verifyCodeSchema.safeParse({ email: "a@davidson.edu", code }).success).toBe(false);
    }
  });
});

describe("verifyLinkSchema", () => {
  it("accepts a token hash and rejects injection attempts", () => {
    expect(
      verifyLinkSchema.safeParse({ token_hash: "pkce_abcDEF123-_xyz", type: "email" }).success,
    ).toBe(true);
    expect(
      verifyLinkSchema.safeParse({ token_hash: "abc'; drop table", type: "email" }).success,
    ).toBe(false);
    expect(
      verifyLinkSchema.safeParse({ token_hash: "abcdefghijk", type: "recovery" }).success,
    ).toBe(false);
  });
});

describe("env parsing", () => {
  const pub = {
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
  };
  const server = {
    ...pub,
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    IP_HASH_SALT: "0123456789abcdef",
    CRON_SECRET: "0123456789abcdef",
  };

  it("parses a valid public env and defaults the site URL", () => {
    expect(parsePublicEnv(pub).NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("names the missing variable without echoing values", () => {
    expect(() => parsePublicEnv({ ...pub, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("requires a 32-byte encryption key", () => {
    expect(() =>
      parseServerEnv({ ...server, APP_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(/APP_ENCRYPTION_KEY/);
    expect(parseServerEnv(server).APP_ENCRYPTION_KEY).toBe(server.APP_ENCRYPTION_KEY);
  });

  it("requires every server secret", () => {
    for (const key of ["DATABASE_URL", "IP_HASH_SALT", "CRON_SECRET"] as const) {
      expect(() => parseServerEnv({ ...server, [key]: undefined })).toThrow(new RegExp(key));
    }
  });
});

describe("rate limit composition", () => {
  it("counts every check and allows only if all pass", async () => {
    const { allow } = await import("@/lib/rate-limit");
    const seen: string[] = [];
    const limiter = async (key: string) => {
      seen.push(key);
      return key !== "b";
    };
    const limit = { windowSeconds: 60, max: 1 };
    expect(await allow(limiter, [{ key: "a", limit }])).toBe(true);
    expect(
      await allow(limiter, [
        { key: "a", limit },
        { key: "b", limit },
      ]),
    ).toBe(false);
    expect(seen).toEqual(["a", "a", "b"]);
  });
});
