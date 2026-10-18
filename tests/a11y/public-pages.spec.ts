import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/found/new",
  "/items",
  "/about",
  "/privacy",
  "/sign-in",
  "/auth/confirm?token_hash=abcdefghijkl&type=email",
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await context.addCookies([{ name: "cf-theme", value: theme, url: baseURL! }]);
    });

    for (const route of ROUTES) {
      test(`${route} has no WCAG 2.1 A/AA violations`, async ({ page }) => {
        await page.goto(route);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  });
}

test("one h1 per page and a working skip link", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("controls are at least 44×44px on the main flows", async ({ page }) => {
  for (const route of ["/", "/found/new", "/items", "/sign-in"]) {
    await page.goto(route);
    // Visually hidden inputs (skip link, file/radio inputs) are excluded; the
    // labels that wrap them are the real touch targets and are checked instead.
    const controls = page.locator(
      "button, a:not(.sr-only), select, input:not(.sr-only):not([type=hidden]), label:has(> input.sr-only)",
    );
    for (const el of await controls.all()) {
      if (!(await el.isVisible())) continue;
      // The off-screen spam honeypot is hidden from people and assistive tech.
      if (await el.evaluate((n) => Boolean(n.closest('[aria-hidden="true"]')))) continue;
      const box = await el.boundingBox();
      const what = `${route}: ${await el.evaluate((n) => n.outerHTML.slice(0, 80))}`;
      expect(box!.height, what).toBeGreaterThanOrEqual(44);
    }
  }
});
