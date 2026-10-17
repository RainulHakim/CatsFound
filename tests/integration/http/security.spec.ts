import { expect, test } from "@playwright/test";

const PAGES = ["/", "/sign-in", "/auth/confirm"];

test.describe("security headers", () => {
  for (const path of [...PAGES, "/api/health"]) {
    test(`${path} sends the baseline headers`, async ({ request }) => {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["strict-transport-security"]).toContain("max-age=");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["x-powered-by"]).toBeUndefined();
    });
  }

  for (const path of PAGES) {
    test(`${path} has a strict per-request CSP and every script carries the nonce`, async ({
      request,
    }) => {
      const a = await request.get(path);
      const b = await request.get(path);
      const csp = a.headers()["content-security-policy"]!;
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

      const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      expect(b.headers()["content-security-policy"]).not.toContain(nonce!);

      const html = await a.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    });
  }
});

test.describe("CSRF", () => {
  test("cross-origin POST is rejected", async ({ request }) => {
    const res = await request.post("/sign-in", {
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: "email=a@davidson.edu",
    });
    expect(res.status()).toBe(403);
  });

  test("POST without an Origin header is rejected", async ({ request }) => {
    const res = await request.post("/sign-in", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: "email=a@davidson.edu",
    });
    expect(res.status()).toBe(403);
  });

  test("a forged prefetch header does not bypass the check", async ({ request }) => {
    const res = await request.post("/sign-in", {
      headers: {
        Origin: "https://evil.example",
        "next-router-prefetch": "1",
        purpose: "prefetch",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("cross-site fetch metadata is rejected even with a matching Origin", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post("/sign-in", {
      headers: { Origin: new URL(baseURL!).origin, "Sec-Fetch-Site": "cross-site" },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("health", () => {
  test("reports database reachability without leaking configuration", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", checks: { db: "ok" } });
    expect(JSON.stringify(body)).not.toMatch(/supabase|key|secret/i);
  });
});

test.describe("indexing", () => {
  test("auth pages are noindex", async ({ request }) => {
    for (const path of ["/sign-in", "/auth/confirm"]) {
      const html = await (await request.get(path)).text();
      expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  });
});
