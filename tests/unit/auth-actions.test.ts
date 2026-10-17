import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = {
  requestSignIn: vi.fn(),
  verifyCode: vi.fn(),
  verifyLink: vi.fn(),
  signOut: vi.fn(),
};
const cookieJar = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const actions = await import("@/app/actions/auth");
const { isAuthEnabled } = await import("@/lib/auth/enabled");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.AUTH_ENABLED;
});

describe("isAuthEnabled", () => {
  it("is off unless AUTH_ENABLED is exactly 'true'", () => {
    expect(isAuthEnabled()).toBe(false);
    for (const v of ["1", "yes", "TRUE", ""]) {
      process.env.AUTH_ENABLED = v;
      expect(isAuthEnabled()).toBe(false);
    }
    process.env.AUTH_ENABLED = "true";
    expect(isAuthEnabled()).toBe(true);
  });
});

describe("when sign-in is switched off", () => {
  it("every action refuses without touching the provider", async () => {
    const email = form({ email: "a@davidson.edu", code: "123456" });
    expect((await actions.requestSignIn({ step: "email" }, email)).error).toMatch(
      /isn't available/,
    );
    expect((await actions.verifyCode({ step: "code" }, email)).error).toMatch(/isn't available/);
    expect(
      (await actions.confirmLink({}, form({ token_hash: "abcdefghijkl", type: "email" }))).error,
    ).toMatch(/isn't available/);
    expect(authMock.requestSignIn).not.toHaveBeenCalled();
    expect(authMock.verifyCode).not.toHaveBeenCalled();
    expect(authMock.verifyLink).not.toHaveBeenCalled();
  });
});

describe("when sign-in is switched on", () => {
  beforeEach(() => {
    process.env.AUTH_ENABLED = "true";
  });

  it("sends a code and remembers a safe next path", async () => {
    authMock.requestSignIn.mockResolvedValue({ ok: true });
    const state = await actions.requestSignIn(
      { step: "email" },
      form({ email: " A@Davidson.edu ", next: "/items" }),
    );
    expect(state).toEqual({ step: "code", email: "a@davidson.edu", next: "/items" });
    expect(authMock.requestSignIn).toHaveBeenCalledWith("a@davidson.edu", { ip: "9.9.9.9" });
    expect(cookieJar.set).toHaveBeenCalledWith(
      "cf-next",
      "/items",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("rejects bad emails with a field error", async () => {
    const state = await actions.requestSignIn({ step: "email" }, form({ email: "a@gmail.com" }));
    expect(state.fieldError).toBe("Use your @davidson.edu email address.");
    expect(authMock.requestSignIn).not.toHaveBeenCalled();
  });

  it("shows a message instead of crashing when the server is misconfigured", async () => {
    authMock.requestSignIn.mockRejectedValue(
      new Error("Invalid server environment: SUPABASE_SECRET_KEY"),
    );
    const state = await actions.requestSignIn({ step: "email" }, form({ email: "a@davidson.edu" }));
    expect(state.error).toMatch(/isn't working right now/);

    authMock.verifyCode.mockRejectedValue(new Error("boom"));
    const v = await actions.verifyCode(
      { step: "code" },
      form({ email: "a@davidson.edu", code: "123456" }),
    );
    expect(v.error).toMatch(/isn't working right now/);

    authMock.verifyLink.mockRejectedValue(new Error("boom"));
    const c = await actions.confirmLink({}, form({ token_hash: "abcdefghijkl", type: "email" }));
    expect(c.error).toMatch(/isn't working right now/);
  });

  it("maps rate limiting to a human message", async () => {
    authMock.requestSignIn.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const state = await actions.requestSignIn({ step: "email" }, form({ email: "a@davidson.edu" }));
    expect(state.error).toMatch(/Too many attempts/);
  });

  it("redirects after a correct code, never off-site", async () => {
    authMock.verifyCode.mockResolvedValue({ ok: true });
    await expect(
      actions.verifyCode(
        { step: "code" },
        form({ email: "a@davidson.edu", code: "123456", next: "//evil.com" }),
      ),
    ).rejects.toThrow("REDIRECT:/");
    await expect(
      actions.verifyCode(
        { step: "code" },
        form({ email: "a@davidson.edu", code: "123456", next: "/me" }),
      ),
    ).rejects.toThrow("REDIRECT:/me");
  });

  it("keeps the user on the code step when the code is wrong", async () => {
    authMock.verifyCode.mockResolvedValue({ ok: false, reason: "invalid_code" });
    const state = await actions.verifyCode(
      { step: "code" },
      form({ email: "a@davidson.edu", code: "000000" }),
    );
    expect(state).toMatchObject({ step: "code", error: expect.stringMatching(/didn't match/) });
  });

  it("confirms an emailed link and goes to the remembered path", async () => {
    authMock.verifyLink.mockResolvedValue({ ok: true });
    cookieJar.get.mockReturnValue({ value: "/items" });
    await expect(
      actions.confirmLink({}, form({ token_hash: "abcdefghijkl", type: "email" })),
    ).rejects.toThrow("REDIRECT:/items");
    expect(cookieJar.delete).toHaveBeenCalledWith("cf-next");
  });

  it("rejects malformed link tokens before calling the provider", async () => {
    const state = await actions.confirmLink({}, form({ token_hash: "x", type: "email" }));
    expect(state.error).toMatch(/expired/);
    expect(authMock.verifyLink).not.toHaveBeenCalled();
  });
});
