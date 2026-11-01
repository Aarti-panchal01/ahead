import { expect, test } from "@playwright/test";

async function expectAtTop(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
}

test("every route transition starts at the top without smooth scrolling", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/how-we-tested$/);
  await expect(page.getByRole("heading", { name: "How we tested this" })).toBeVisible();
  await expectAtTop(page);

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.getByRole("link", { name: "Use your photo" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Before you use your photo" })).toBeVisible();
  await expectAtTop(page);

  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole("heading", { name: "Start with a photo of you." })).toBeVisible();
  await expectAtTop(page);
});
