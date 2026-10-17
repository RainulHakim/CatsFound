import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createClientMock = vi.fn<(...args: unknown[]) => unknown>(() => ({ rpc }));
const createServerClientMock = vi.fn<(...args: unknown[]) => unknown>(() => ({
  kind: "user-client",
}));
const cookieStore = { getAll: vi.fn(() => [{ name: "a", value: "b" }]), set: vi.fn() };

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => createClientMock(...a),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...a: unknown[]) => createServerClientMock(...a),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://catfound.example",
  SUPABASE_SECRET_KEY: "sb_secret_0123456789abcdefghij",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  IP_HASH_SALT: "0123456789abcdef",
  CRON_SECRET: "0123456789abcdef",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
});

describe("Supabase clients", () => {
  it("the service client never persists or refreshes a session", async () => {
    const { createServiceClient } = await import("@/lib/db/server");
    createServiceClient();
    expect(createClientMock).toHaveBeenCalledWith(
      ENV.NEXT_PUBLIC_SUPABASE_URL,
      ENV.SUPABASE_SECRET_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
  });

  it("the user client uses the publishable key and hardens cookies it writes", async () => {
    const { createUserClient } = await import("@/lib/db/server");
    await createUserClient();
    const [url, key, opts] = createServerClientMock.mock.calls[0] as [
      string,
      string,
      { cookies: { getAll: () => unknown; setAll: (c: unknown[]) => void } },
    ];
    expect(url).toBe(ENV.NEXT_PUBLIC_SUPABASE_URL);
    expect(key).toBe(ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(opts.cookies.getAll()).toEqual([{ name: "a", value: "b" }]);

    opts.cookies.setAll([
      { name: "sb-x", value: "v", options: { httpOnly: false, maxAge: 999999 } },
    ]);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "sb-x",
      "v",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 2592000 }),
    );
  });

  it("swallows cookie writes from read-only Server Component contexts", async () => {
    const { createUserClient } = await import("@/lib/db/server");
    await createUserClient();
    const opts = createServerClientMock.mock.calls[0]![2] as {
      cookies: { setAll: (c: unknown[]) => void };
    };
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error("read-only");
    });
    expect(() => opts.cookies.setAll([{ name: "x", value: "y", options: {} }])).not.toThrow();
  });
});

describe("dbLimiter", () => {
  it("calls rate_limit_hit and returns its verdict", async () => {
    const { dbLimiter } = await import("@/lib/rate-limit");
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await dbLimiter("k", 60, 3)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "k",
      p_window_seconds: 60,
      p_max: 3,
    });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await dbLimiter("k", 60, 3)).toBe(false);
  });

  it("fails closed when the database errors", async () => {
    const { dbLimiter } = await import("@/lib/rate-limit");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await dbLimiter("signin:email:x", 60, 3)).toBe(false);
  });
});

describe("env accessors", () => {
  it("parse process.env once and cache", async () => {
    vi.resetModules();
    const { publicEnv, serverEnv } = await import("@/lib/env");
    expect(publicEnv().NEXT_PUBLIC_SITE_URL).toBe(ENV.NEXT_PUBLIC_SITE_URL);
    expect(serverEnv().CRON_SECRET).toBe(ENV.CRON_SECRET);
    process.env.CRON_SECRET = "changed-but-cached-value";
    expect(serverEnv().CRON_SECRET).toBe(ENV.CRON_SECRET);
  });
});

describe("theme", () => {
  it("parses known themes and defaults to system", async () => {
    const { parseTheme } = await import("@/lib/theme");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("neon")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });
});

describe("cn", () => {
  it("merges conflicting utilities", async () => {
    const { cn } = await import("@/lib/cn");
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
  });
});

describe("/api/health", () => {
  function supabaseReturning(result: unknown) {
    createClientMock.mockReturnValueOnce({
      from: () => ({ select: () => ({ limit: async () => result }) }),
    } as never);
  }

  it("is ok when the database answers", async () => {
    const { GET } = await import("@/app/api/health/route");
    supabaseReturning({ error: null, status: 200 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", checks: { db: "ok" } });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is degraded (503) when the schema is missing or the query errors", async () => {
    const { GET } = await import("@/app/api/health/route");
    supabaseReturning({ error: { message: "missing" }, status: 404 });
    expect((await GET()).status).toBe(503);
    supabaseReturning({ error: null, status: 404 });
    expect((await GET()).status).toBe(503);
  });

  it("is degraded when the database is unreachable", async () => {
    const { GET } = await import("@/app/api/health/route");
    createClientMock.mockImplementationOnce(() => {
      throw new Error("ECONNREFUSED");
    });
    expect((await GET()).status).toBe(503);
  });
});
