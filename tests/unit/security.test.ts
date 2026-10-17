import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { isCsrfSafe } from "@/lib/security/csrf";
import { clientIp, hashIp } from "@/lib/security/request";
import { safeNextPath } from "@/lib/security/redirect";
import { hardenCookieOptions, SESSION_MAX_AGE_SECONDS } from "@/lib/db/cookies";

describe("buildCsp", () => {
  const base = {
    nonce: "abc123",
    isDev: false,
    supabaseUrl: "https://proj.supabase.co",
    upgradeInsecure: true,
  };

  it("never allows unsafe-inline scripts", () => {
    for (const isDev of [true, false]) {
      const csp = buildCsp({ ...base, isDev });
      const script = csp.split("; ").find((d) => d.startsWith("script-src "))!;
      expect(script).not.toContain("unsafe-inline");
      expect(script).toContain("'nonce-abc123'");
      expect(script).toContain("'strict-dynamic'");
    }
  });

  it("forbids framing, plugins and foreign form targets", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("allows signed photo URLs from the Supabase origin only", () => {
    const img = buildCsp(base)
      .split("; ")
      .find((d) => d.startsWith("img-src "))!;
    expect(img).toBe("img-src 'self' blob: data: https://proj.supabase.co");
  });

  it("allows unsafe-eval in development only", () => {
    expect(buildCsp({ ...base, isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp(base)).not.toContain("'unsafe-eval'");
  });

  it("uses a nonce for styles in production", () => {
    const style = buildCsp(base)
      .split("; ")
      .find((d) => d.startsWith("style-src "))!;
    expect(style).toBe("style-src 'self' 'nonce-abc123'");
  });

  it("adds upgrade-insecure-requests only when asked", () => {
    expect(buildCsp(base)).toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, upgradeInsecure: false })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("generateNonce", () => {
  it("is unique and at least 128 bits", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64").length).toBeGreaterThanOrEqual(16);
  });
});

describe("isCsrfSafe", () => {
  const post = { method: "POST", host: "catfound.app", secFetchSite: "same-origin" };

  it("allows safe methods regardless of origin", () => {
    expect(
      isCsrfSafe({
        method: "GET",
        origin: "https://evil.com",
        host: "catfound.app",
        secFetchSite: "cross-site",
      }),
    ).toBe(true);
  });

  it("allows same-origin POSTs", () => {
    expect(isCsrfSafe({ ...post, origin: "https://catfound.app" })).toBe(true);
  });

  it("rejects cross-origin POSTs", () => {
    expect(isCsrfSafe({ ...post, origin: "https://evil.com" })).toBe(false);
    expect(isCsrfSafe({ ...post, origin: "https://catfound.app.evil.com" })).toBe(false);
  });

  it("rejects POSTs with no Origin", () => {
    expect(isCsrfSafe({ ...post, origin: null })).toBe(false);
  });

  it("rejects requests flagged cross-site even with a matching Origin", () => {
    expect(
      isCsrfSafe({ ...post, origin: "https://catfound.app", secFetchSite: "cross-site" }),
    ).toBe(false);
  });

  it("rejects garbage Origin values", () => {
    expect(isCsrfSafe({ ...post, origin: "null" })).toBe(false);
  });

  it("applies to every mutating method", () => {
    for (const method of ["PUT", "PATCH", "DELETE", "post"]) {
      expect(isCsrfSafe({ ...post, method, origin: "https://evil.com" })).toBe(false);
    }
  });
});

describe("client IP and hashing", () => {
  it("takes the first X-Forwarded-For hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("hashes deterministically per salt and never returns the raw IP", () => {
    const h = hashIp("1.2.3.4", "salt-salt-salt-salt");
    expect(h).toBe(hashIp("1.2.3.4", "salt-salt-salt-salt"));
    expect(h).not.toBe(hashIp("1.2.3.4", "other-salt-other-salt"));
    expect(h).not.toContain("1.2.3.4");
    expect(h).toHaveLength(32);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/items", "/items"],
    ["/items?category=keys#top", "/items?category=keys#top"],
    ["/me", "/me"],
  ])("allows %s", (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "items",
    "/items\n",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });

  it("uses the fallback for null/undefined", () => {
    expect(safeNextPath(null, "/items")).toBe("/items");
    expect(safeNextPath(undefined)).toBe("/");
  });
});

describe("hardenCookieOptions", () => {
  it("forces httpOnly, lax, path=/ and a 30-day sliding maxAge", () => {
    const out = hardenCookieOptions(
      { httpOnly: false, maxAge: 400 * 86400, sameSite: "none" },
      true,
    );
    expect(out).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("keeps removals as removals", () => {
    expect(hardenCookieOptions({ maxAge: 0 }, false).maxAge).toBe(0);
  });
});
