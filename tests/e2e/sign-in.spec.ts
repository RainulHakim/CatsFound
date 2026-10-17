import { expect, test } from "@playwright/test";

test("rejects non-Davidson emails with an announced, linked error", async ({ page }) => {
  await page.goto("/sign-in");
  const email = page.getByLabel("Davidson email");
  await email.fill("someone@gmail.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  const error = page.getByText("Use your @davidson.edu email address.");
  await expect(error).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  const describedBy = await email.getAttribute("aria-describedby");
  expect(describedBy).toContain(await error.getAttribute("id"));
});

test("the emailed link does not sign in on GET", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=abcdefghijkl&type=email");
  await expect(page.getByRole("button", { name: "Sign in to CatFound" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Sign in" }),
  ).toBeVisible(); // still signed out
});

// Full round trip needs a mail catcher: runs in CI against the local Supabase stack.
const MAILPIT = process.env.MAILPIT_URL;

test.describe("full sign-in", () => {
  test.skip(!MAILPIT, "MAILPIT_URL not set");

  test("a Davidson student signs in with the emailed code, then signs out", async ({ page }) => {
    const address = `e2e.${Date.now()}@davidson.edu`;
    await page.goto("/sign-in?next=/");
    await page.getByLabel("Davidson email").fill(address);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/Code sent to/)).toBeVisible();

    let code: string | undefined;
    await expect
      .poll(async () => (code = await latestCode(address)), { timeout: 15_000 })
      .toMatch(/^\d{6}$/);

    await page.getByLabel("6-digit code").fill(code!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(`Signed in as ${address}`)).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
  });
});

async function latestCode(address: string): Promise<string | undefined> {
  const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  if (!list.ok) return undefined;
  const { messages } = (await list.json()) as { messages: { ID: string }[] };
  const id = messages[0]?.ID;
  if (!id) return undefined;
  const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text: string;
    HTML: string;
  };
  return (msg.Text || msg.HTML).match(/\b(\d{6})\b/)?.[1];
}
