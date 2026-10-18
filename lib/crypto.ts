import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM for fields stored "encrypted at rest" (verification secret,
 * finder contact). Format: v1.<iv>.<tag>.<ciphertext>, base64url.
 */
const VERSION = "v1";

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes");
  return key;
}

export function encrypt(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(payload: string, base64Key: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ct === undefined) throw new Error("bad ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFrom(base64Key),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}

/** Short signed token proving the holder just posted this item. */
export function signItemToken(itemId: string, secret: string): string {
  return createHmac("sha256", secret).update(`item:${itemId}`).digest("base64url").slice(0, 32);
}

export function verifyItemToken(itemId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(signItemToken(itemId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
