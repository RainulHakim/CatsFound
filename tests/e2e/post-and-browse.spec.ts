import { expect, test } from "@playwright/test";

// Writes to the database, so it only runs in CI against the disposable stack.
test.skip(!process.env.CI, "writes to the database; runs in CI");

test("an anonymous finder posts an item and a student finds it", async ({ page, request }) => {
  const tag = `e2e-${Date.now()}`;

  await page.goto("/?src=qr");
  await page.getByRole("link", { name: "I found something" }).click();
  await expect(page).toHaveURL(/\/found\/new/);

  await page.locator('input[name="photos"]').setInputFiles("tests/fixtures/bottle-with-gps.jpg");
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await page.getByText("Water bottle", { exact: true }).click();
  await page.getByLabel("Where did you find it?").selectOption({ label: "Chambers Building" });
  await page.getByLabel(/Describe it/).fill(`Blue bottle ${tag}`);
  await page.getByLabel(/only the owner would know/).fill("mountain sticker underneath");
  await page.getByRole("button", { name: "Post found item" }).click();

  await expect(page.getByRole("heading", { name: "Posted. Thank you!" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm drop-off" }).click();
  await expect(page.getByText("Drop it at Alvarez Union desk.")).toBeVisible();

  await page.goto(`/items?q=${tag}`);
  const card = page.getByRole("link", { name: /Water bottle/ }).first();
  await expect(card).toBeVisible();
  const img = card.getByRole("img", { name: "Water bottle found in Chambers Building" });
  await expect(img).toBeVisible();

  // The served photo is re-encoded WebP with no EXIF, and the secret never reaches the page.
  const src = await img.getAttribute("src");
  const photo = await request.get(src!);
  expect(photo.headers()["content-type"]).toBe("image/webp");
  const bytes = await photo.body();
  expect(bytes.includes(Buffer.from("finder-name"))).toBe(false);
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);

  await card.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Water bottle");
  expect(await page.content()).not.toContain("mountain sticker");
});

test("missing fields are announced and nothing is lost", async ({ page }) => {
  await page.goto("/found/new");
  await page.getByLabel(/Describe it/).fill("keep me");
  await page.getByRole("button", { name: "Post found item" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Add a photo of what you found.")).toBeVisible();
  await expect(page.getByLabel("Where did you find it?")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel(/Describe it/)).toHaveValue("keep me");
});

test("valuables are listed without a photo and routed to the Union desk", async ({ page }) => {
  await page.goto("/found/new");
  await page.locator('input[name="photos"]').setInputFiles("tests/fixtures/bottle-with-gps.jpg");
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await page.getByText(/More kinds/).click();
  await page.getByText("Wallet", { exact: true }).click();
  await expect(page.getByText(/shown without a photo/)).toBeVisible();
  await page.getByLabel("Where did you find it?").selectOption({ label: "Wall Academic Center" });
  await page.getByRole("button", { name: "Post found item" }).click();

  await expect(page.getByText(/goes to the/)).toBeVisible();
  // Only the Union desk is offered for valuables.
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio", { name: /Alvarez Union desk/ })).toBeVisible();

  await page.goto("/items");
  await expect(page.getByText(/A wallet was found in Wall Academic Center/).first()).toBeVisible();
});
