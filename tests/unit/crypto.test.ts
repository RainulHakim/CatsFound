import { describe, expect, it } from "vitest";
import { decrypt, encrypt, signItemToken, verifyItemToken } from "@/lib/crypto";

const KEY = Buffer.alloc(32, 9).toString("base64");
const OTHER = Buffer.alloc(32, 3).toString("base64");

describe("encrypt/decrypt", () => {
  it("round-trips and never stores plaintext", () => {
    const c = encrypt("small dent by the left bud", KEY);
    expect(c).toMatch(/^v1\./);
    expect(c).not.toContain("dent");
    expect(decrypt(c, KEY)).toBe("small dent by the left bud");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same", KEY)).not.toBe(encrypt("same", KEY));
  });

  it("fails with the wrong key or tampered ciphertext", () => {
    const c = encrypt("secret", KEY);
    expect(() => decrypt(c, OTHER)).toThrow();
    const parts = c.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), KEY)).toThrow();
    expect(() => decrypt("garbage", KEY)).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow();
  });
});

describe("item tokens", () => {
  it("verify only for the same item and secret", () => {
    const t = signItemToken("item-1", "s3cret-s3cret");
    expect(verifyItemToken("item-1", t, "s3cret-s3cret")).toBe(true);
    expect(verifyItemToken("item-2", t, "s3cret-s3cret")).toBe(false);
    expect(verifyItemToken("item-1", t, "other-secret")).toBe(false);
    expect(verifyItemToken("item-1", "short", "s3cret-s3cret")).toBe(false);
  });
});
