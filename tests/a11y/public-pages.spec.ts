import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/sign-in", "/auth/confirm?token_hash=abcdefghijkl&type=email"];

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

test("primary controls are at least 44×44px", async ({ page }) => {
  await page.goto("/sign-in");
  // The skip link is visually hidden (1px) until focused, so it is excluded.
  for (const el of await page.locator("button, input, a:not(.sr-only)").all()) {
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    expect(box!.height, await el.evaluate((n) => n.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(
      44,
    );
  }
});
