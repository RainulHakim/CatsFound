import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks ---------------------------------------------------------------

const authApi = {
  getClaims: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
const profileQuery = { maybeSingle: vi.fn() };
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => profileQuery }),
}));

vi.mock("@/lib/db/server", () => ({
  createUserClient: async () => ({ auth: authApi, from: fromMock }),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ IP_HASH_SALT: "test-salt-test-salt" }),
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const { createSupabaseAuthProvider } = await import("@/lib/auth/supabase-provider");

// ---- helpers ---------------------------------------------------------------

function provider(limits: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const limiter = vi.fn(async (key: string) => {
    calls.push(key);
    const prefix = Object.keys(limits).find((p) => key.startsWith(p));
    return prefix ? limits[prefix]! : true;
  });
  return { auth: createSupabaseAuthProvider({ limiter }), calls, limiter };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- tests -----------------------------------------------------------------

describe("getUser", () => {
  it("returns null without verified claims", async () => {
    authApi.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await provider().auth.getUser()).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when claim verification errors", async () => {
    authApi.getClaims.mockResolvedValue({
      data: { claims: { sub: "u1" } },
      error: new Error("bad jwt"),
    });
    expect(await provider().auth.getUser()).toBeNull();
  });

  it("reads the role from the database, not the token", async () => {
    authApi.getClaims.mockResolvedValue({
      data: { claims: { sub: "u1", role: "admin", app_metadata: { role: "admin" } } },
      error: null,
    });
    profileQuery.maybeSingle.mockResolvedValue({
      data: { id: "u1", email: "a@davidson.edu", role: "student", display_name: null },
      error: null,
    });
    expect(await provider().auth.getUser()).toEqual({
      id: "u1",
      email: "a@davidson.edu",
      role: "student",
      displayName: null,
    });
    expect(fromMock).toHaveBeenCalledWith("users");
  });

  it("returns null if the profile is missing or the lookup fails", async () => {
    authApi.getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    profileQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await provider().auth.getUser()).toBeNull();
    profileQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await provider().auth.getUser()).toBeNull();
  });
});

describe("requestSignIn", () => {
  it("refuses non-Davidson emails before touching limits or the provider", async () => {
    const p = provider();
    expect(await p.auth.requestSignIn("a@gmail.com", { ip: "1.1.1.1" })).toEqual({
      ok: false,
      reason: "invalid_email",
    });
    expect(p.limiter).not.toHaveBeenCalled();
    expect(authApi.signInWithOtp).not.toHaveBeenCalled();
  });

  it("checks the per-email and per-IP limits, never with the raw IP", async () => {
    authApi.signInWithOtp.mockResolvedValue({ error: null });
    const p = provider();
    expect(await p.auth.requestSignIn("a@davidson.edu", { ip: "1.2.3.4" })).toEqual({ ok: true });
    expect(p.calls).toHaveLength(2);
    expect(p.calls[0]).toBe("signin:email:a@davidson.edu");
    expect(p.calls[1]).toMatch(/^signin:ip:[0-9a-f]{32}$/);
    expect(p.calls.join()).not.toContain("1.2.3.4");
    expect(authApi.signInWithOtp).toHaveBeenCalledWith({
      email: "a@davidson.edu",
      options: { shouldCreateUser: true },
    });
  });

  it("is rate limited per email (3/15min) and per IP (10/hr)", async () => {
    for (const blocked of ["signin:email:", "signin:ip:"]) {
      const p = provider({ [blocked]: false });
      expect(await p.auth.requestSignIn("a@davidson.edu", { ip: "1.2.3.4" })).toEqual({
        ok: false,
        reason: "rate_limited",
      });
      expect(authApi.signInWithOtp).not.toHaveBeenCalled();
    }
    const { LIMITS } = await import("@/lib/rate-limit");
    expect(LIMITS.signInPerEmail).toEqual({ windowSeconds: 900, max: 3 });
    expect(LIMITS.signInPerIp).toEqual({ windowSeconds: 3600, max: 10 });
  });

  it("maps provider failures", async () => {
    authApi.signInWithOtp.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit" },
    });
    expect(await provider().auth.requestSignIn("a@davidson.edu", { ip: "x" })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    authApi.signInWithOtp.mockResolvedValueOnce({
      error: { status: 500, code: "unexpected_failure" },
    });
    expect(await provider().auth.requestSignIn("a@davidson.edu", { ip: "x" })).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });
});

describe("verifyCode", () => {
  it("verifies an email OTP", async () => {
    authApi.verifyOtp.mockResolvedValue({ error: null });
    expect(await provider().auth.verifyCode("a@davidson.edu", "123456")).toEqual({ ok: true });
    expect(authApi.verifyOtp).toHaveBeenCalledWith({
      email: "a@davidson.edu",
      token: "123456",
      type: "email",
    });
  });

  it("is rate limited per email to stop code guessing", async () => {
    const p = provider({ "verify:email:": false });
    expect(await p.auth.verifyCode("a@davidson.edu", "123456")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(authApi.verifyOtp).not.toHaveBeenCalled();
  });

  it("distinguishes expired from wrong codes", async () => {
    authApi.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired" } });
    expect(await provider().auth.verifyCode("a@davidson.edu", "123456")).toMatchObject({
      reason: "expired_or_used",
    });
    authApi.verifyOtp.mockResolvedValueOnce({ error: { code: "invalid_credentials" } });
    expect(await provider().auth.verifyCode("a@davidson.edu", "123456")).toMatchObject({
      reason: "invalid_code",
    });
  });
});

describe("verifyLink and signOut", () => {
  it("verifies a token hash", async () => {
    authApi.verifyOtp.mockResolvedValueOnce({ error: null });
    expect(await provider().auth.verifyLink("hash123")).toEqual({ ok: true });
    expect(authApi.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash123", type: "email" });
    authApi.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired" } });
    expect(await provider().auth.verifyLink("hash123")).toEqual({
      ok: false,
      reason: "expired_or_used",
    });
  });

  it("signs out the local session only", async () => {
    await provider().auth.signOut();
    expect(authApi.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("role guards (lib/auth)", () => {
  async function loadWithUser(user: unknown) {
    vi.resetModules();
    vi.doMock("@/lib/auth/supabase-provider", () => ({
      createSupabaseAuthProvider: () => ({ getUser: async () => user }),
    }));
    return import("@/lib/auth");
  }

  it("requireUser redirects signed-out visitors to sign-in with a next path", async () => {
    const { requireUser } = await loadWithUser(null);
    await expect(requireUser("/items?x=1")).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fitems%3Fx%3D1",
    );
  });

  it("requireRole lets staff through and forbids students", async () => {
    const student = { id: "s", email: "s@davidson.edu", role: "student", displayName: null };
    const staff = { ...student, id: "t", role: "staff" };
    let mod = await loadWithUser(student);
    await expect(mod.requireRole(["staff", "admin"], "/staff")).rejects.toBeInstanceOf(
      mod.ForbiddenError,
    );
    mod = await loadWithUser(staff);
    await expect(mod.requireRole(["staff", "admin"], "/staff")).resolves.toEqual(staff);
  });

  it("hasRole handles signed-out users", async () => {
    const { hasRole } = await loadWithUser(null);
    expect(hasRole(null, ["student"])).toBe(false);
  });
});
