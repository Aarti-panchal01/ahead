import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { cards } from "./helpers";

test("all 16 own-photo previews finish and the grid stays whole at three viewport sizes", async ({ page }) => {
  mkdirSync("test/e2e/.results/lookbook", { recursive: true });
  const creates: string[] = [];
  await page.route("**/api/status", (route) => route.fulfill({
    json: { mode: "live", servingRecordings: false, remainingToday: 80, testerRequired: false },
  }));
  await page.route("**/api/tryon", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const match = route.request().postData()?.match(/name="itemId"\r?\n\r?\n([WH]\d{2})/);
    if (!match) return route.fulfill({ status: 400, json: { error: "itemId missing" } });
    creates.push(match[1]);
    await route.fulfill({ json: { id: `mock:${match[1]}` } });
  });
  await page.route("**/api/tryon/**", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    const code = id.replace("mock:", "");
    return route.fulfill({ json: { id, itemId: code, status: "success", resultUrl: `/catalogue/${code}.jpg` } });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Start with my photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/personas/P1B.jpg");
  await page.getByRole("button", { name: "Continue with this photo" }).click();
  await page.getByRole("radio", { name: "Most or all has fallen out" }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();

  await expect.poll(() => creates.length, { timeout: 30_000 }).toBe(16);
  await expect(cards(page)).toHaveCount(12);
  expect(new Set(creates).size).toBe(16);
  let visibleResults: { styleId: string; resultStyleId: string; src: string }[] = [];
  for (const card of await cards(page).all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator("img").or(card.getByRole("button", { name: "Retry this style" }))).toBeVisible({ timeout: 120_000 });
  }
  visibleResults = await cards(page).evaluateAll((articles) => articles.map((article) => ({
    styleId: article.getAttribute("data-style-id") ?? "",
    resultStyleId: article.getAttribute("data-result-style-id") ?? "",
    src: article.querySelector("img")?.getAttribute("src") ?? "",
  })));
  expect(visibleResults).toHaveLength(12);
  expect(visibleResults.every((row) => row.styleId === row.resultStyleId && row.src)).toBe(true);
  await page.getByRole("tab", { name: "Wraps & caps" }).click();
  await expect(cards(page)).toHaveCount(4);
  for (const card of await cards(page).all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator("img").or(card.getByRole("button", { name: "Retry this style" }))).toBeVisible({ timeout: 120_000 });
  }
  const wrapResults = await cards(page).evaluateAll((articles) => articles.map((article) => ({
    styleId: article.getAttribute("data-style-id") ?? "",
    resultStyleId: article.getAttribute("data-result-style-id") ?? "",
    src: article.querySelector("img")?.getAttribute("src") ?? "",
  })));
  expect(wrapResults).toHaveLength(4);
  expect(wrapResults.every((row) => row.styleId === row.resultStyleId && row.src)).toBe(true);
  expect(new Set([...visibleResults, ...wrapResults].map((row) => row.src)).size).toBe(16);
  await expect(page.getByText("All 16 previews are ready on your photo.")).toBeVisible();

  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 900, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole("tab", { name: "Wigs" }).click();
    await expect(cards(page)).toHaveCount(12);
    const layout = await cards(page).first().locator("figure").evaluate((el) => {
      const frame = el.getBoundingClientRect();
      const img = el.querySelector("img")!;
      const style = getComputedStyle(img);
      return { ratio: frame.width / frame.height, fit: style.objectFit, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(layout.ratio).toBeCloseTo(0.8, 1);
    expect(layout.fit).toBe("contain");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test/e2e/.results/lookbook/lookbook-${viewport.name}.png`, fullPage: true });
    if (viewport.name === "mobile") {
      await page.getByRole("tab", { name: "Wraps & caps" }).click();
      await page.screenshot({ path: "test/e2e/.results/lookbook/lookbook-headwear-mobile.png", fullPage: true });
    }
  }
});

test("a duplicate image is blocked for the second style and cannot earn an all-ready banner", async ({ page }) => {
  const created: string[] = [];
  await page.route("**/api/status", (route) => route.fulfill({
    json: { mode: "live", servingRecordings: false, remainingToday: 80, testerRequired: false },
  }));
  await page.route("**/api/tryon", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const styleId = route.request().postData()?.match(/name="itemId"\r?\n\r?\n([WH]\d{2})/)?.[1] ?? "";
    created.push(styleId);
    await route.fulfill({ json: { id: `mock:${styleId}` } });
  });
  await page.route("**/api/tryon/**", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    const styleId = id.replace("mock:", "");
    const imageId = styleId === "W09" ? "W03" : styleId;
    return route.fulfill({ json: { id, itemId: styleId, status: "success", resultUrl: `/catalogue/${imageId}.jpg` } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Start with my photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/personas/P1B.jpg");
  await page.getByRole("button", { name: "Continue with this photo" }).click();
  await page.getByRole("radio", { name: "Most or all has fallen out" }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect.poll(() => created.length, { timeout: 30_000 }).toBe(16);
  const retry = page.getByRole("button", { name: "Retry this style" });
  await expect(retry).toHaveCount(1, { timeout: 180_000 });
  await expect(page.getByText("All 16 previews are ready on your photo.")).toHaveCount(0);
  await expect(page.getByText(/15 distinct previews are ready for 16 styles/)).toBeVisible();
});

test("daily cap explains the pause and keeps every style card explicit without creating paid work", async ({ page }) => {
  let creates = 0;
  await page.route("**/api/status", (route) => route.fulfill({
    json: { mode: "live", servingRecordings: false, remainingToday: 0, reason: "daily_cap", testerRequired: false },
  }));
  await page.route("**/api/tryon", async (route) => {
    if (route.request().method() === "POST") creates++;
    await route.fulfill({ status: 500, json: { error: "should not create a paid render" } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Start with my photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/personas/P1B.jpg");
  await page.getByRole("button", { name: "Continue with this photo" }).click();
  await page.getByRole("radio", { name: "Most or all has fallen out" }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page.getByText("Live previews have reached today's limit. Your photo stays on this device; try again tomorrow.")).toBeVisible();
  await expect(cards(page).getByRole("status").filter({ hasText: "Daily preview limit reached. Try this style when it resets." })).toHaveCount(12);
  expect(creates).toBe(0);
});
