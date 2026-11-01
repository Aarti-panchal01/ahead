// The hero flow in mock mode (no YouCam call is ever made): landing to results, brows, wraps, compare, match card,
// stylist brief, plan, and the honesty page. Runs at 390x844 and 1280x800 (see playwright.config.ts).
import { expect, test } from "@playwright/test";
import catalogue from "../../catalogue/catalogue.json";
import { INTEGRITY_RE, cards, isoInDays, toResults, waitForChecked } from "./helpers";

test("landing makes the patient and fitting purpose clear", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See your next look, on you.");
  await expect(page.getByText("A personal try-on for treatment-related hair loss")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start with my photo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore sample previews" })).toBeVisible();
  await expect(page.getByText("Powered by YouCam Hair Transfer.")).toBeVisible();
});

test("judge can explore recorded sample try-ons without uploading a photo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore sample previews" }).click();
  await expect(page).toHaveURL(/\/results\?person=P3&stage=gone/);
  await expect(page.getByRole("heading", { name: "Matches for sample person 3" })).toBeVisible();
  // The sample's ranked wig tab shows four recorded directions; the full 12-style catalogue is available
  // in own-photo mode and is tested separately.
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).first().getByRole("img", { name: /wearing the/i }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Skin tone check|Corrected:/).first()).toBeVisible({ timeout: 120_000 });
});

test("own photo opens the full catalogue without ever borrowing a model face", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Start with my photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/personas/P1B.jpg");
  await expect(page.getByRole("img", { name: "Your selected photo" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with this photo" }).click();
  await page.getByRole("radio", { name: "Most or all has fallen out" }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();

  await expect(cards(page)).toHaveCount(12);
  await expect(page.getByText("Live previews are off in this local build.")).toBeVisible();
  await expect(page.getByText("Shown on our model")).toHaveCount(0);
  await expect(cards(page).first().getByText("This look will be shown on your photo.")).toBeVisible();

  await page.getByRole("tab", { name: "Wraps & caps" }).click();
  await expect(cards(page)).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Explore wraps, turbans & caps" })).toBeVisible();
  await expect(page.getByText("Shown on our model")).toHaveCount(0);
});

test("live-mode own photo auto-starts all 16 lookbook previews together", async ({ page }) => {
  let creates = 0;
  await page.route("**/api/status", (route) => route.fulfill({
    json: { mode: "live", servingRecordings: false, remainingToday: 40, testerRequired: false },
  }));
  await page.route("**/api/tryon", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    creates += 1;
    await route.fulfill({ json: { id: `e2e-live-${creates}` } });
  });
  await page.route("**/api/tryon/**", (route) => route.fulfill({
    json: { id: "e2e-live", status: "running" },
  }));

  await page.goto("/");
  await page.getByRole("link", { name: "Start with my photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/personas/P1B.jpg");
  await page.getByRole("button", { name: "Continue with this photo" }).click();
  await page.getByRole("radio", { name: "Most or all has fallen out" }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();

  await expect(cards(page)).toHaveCount(12);
  await expect.poll(() => creates, { timeout: 20_000 }).toBe(16);
  await expect(page.getByText("Preparing all 16 previews on your photo.")).toBeVisible();
  await expect(cards(page).getByRole("button", { name: "See this look on me" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("ahead-live-preview-queue.png") });
  await page.getByRole("tab", { name: "Wraps & caps" }).click();
  await expect(cards(page)).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath("ahead-live-headwear-queue.png") });
});

test("sample lookbook: results with checks, brows, headwear, compare, match card, brief", async ({ page }) => {
  await toResults(page, "My hair is gone", 1);
  await expect(page.getByRole("region", { name: "Fitting bag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to fitting brief" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("fitting-bag.png"), fullPage: true });

  // 4 wig cards, each with her own recording and its integrity line.
  const lines = await waitForChecked(page, 4);
  // Record what the browser check said (it may say "couldn't run on this device" where WebGL is missing).
  test.info().annotations.push({ type: "integrity", description: lines.join(" | ") });
  console.log(`integrity lines: ${lines.join(" | ")}`);
  await expect(page.getByText("Shown on our model")).toHaveCount(0);
  await expect(page.getByText(/isn.t recorded/i)).toHaveCount(0);
  await expect(page.getByText("Getting her preview ready.")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await expect(cards(page).nth(i).getByRole("heading", { level: 2 })).not.toBeEmpty();
  const firstCard = cards(page).first();
  await expect(firstCard).toContainText("AHD-WIG-");
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.getByRole("button", { name: "Model reference" }).click();
  const modelReference = firstCard.getByRole("img", { name: /Reference model wearing/i });
  await expect(modelReference).toBeVisible();
  await expect.poll(() => modelReference.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("style-model-reference.png") });
  await firstCard.getByRole("button", { name: "On sample" }).click();
  const sampleImage = firstCard.getByRole("img", { name: /wearing the/i });
  await expect(sampleImage).toBeVisible();
  await expect.poll(() => sampleImage.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("style-on-sample.png") });

  // Brows toggle says what it does, and flips.
  await expect(page.getByRole("button", { name: "Show without brows" })).toBeVisible();
  await page.getByRole("button", { name: "Show without brows" }).click();
  await expect(page.getByRole("button", { name: "Show with brows" })).toBeVisible();
  await expect(cards(page).first().getByText(INTEGRITY_RE)).toBeVisible();
  await page.getByRole("button", { name: "Show with brows" }).click();
  await expect(page.getByRole("button", { name: "Show without brows" })).toBeVisible();
  await waitForChecked(page, 4);

  // Wraps tab: 4 wraps.
  await page.getByRole("tab", { name: "Wraps & caps" }).click();
  await expect(page.getByRole("tab", { name: "Wraps & caps" })).toHaveAttribute("aria-selected", "true");
  await waitForChecked(page, 4);
  await page.getByRole("tab", { name: "Wigs" }).click();
  await expect(cards(page)).toHaveCount(4);

  // Colour match card.
  await cards(page).first().getByRole("button", { name: "See the colour match" }).click();
  const match = page.getByRole("region", { name: /^Colour match for the/ });
  await expect(match).toBeVisible();
  await expect(match.getByText("Her hair", { exact: true })).toBeVisible();
  await expect(match.getByText("This wig", { exact: true })).toBeVisible();
  await expect(match.getByText(/lock of/i).first()).toBeVisible();

  // Compare two side by side.
  await cards(page).nth(0).getByRole("button", { name: "Save to fitting bag" }).click();
  await expect(page.getByText("1 look saved for your fitting")).toBeVisible();
  await cards(page).nth(1).getByRole("button", { name: "Save to fitting bag" }).click();
  await page.getByRole("button", { name: "Compare two looks" }).click();
  await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await expect(page.getByText(/Wig ·/).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /wearing the/i })).toHaveCount(2);
  await expect(page.getByText(INTEGRITY_RE)).toHaveCount(2, { timeout: 60_000 });
  await page.screenshot({ path: test.info().outputPath("fitting-compare.png"), fullPage: true });
  await page.getByRole("button", { name: "Take these two to my fitting brief" }).click();
  await expect(page.getByRole("heading", { name: "Create your fitting brief" })).toBeInViewport();

  // Stylist brief (POST /api/brief with the in-memory store), then the brief page.
  await page.getByRole("button", { name: "Create fitting brief" }).click();
  await expect(page).toHaveURL(/\/brief\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Bring the looks you like." })).toBeVisible();
  await expect(page.getByRole("img", { name: /Style reference for/ })).toHaveCount(2);
  await expect(page.getByText(/^This link stops working on .+\d{4}\. This link includes your selected style references and notes, never your photo\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What to confirm with the specialist" })).toBeVisible();
  await expect(page.getByText(/closest to each direction/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / save as PDF" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("fitting-brief.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  const printLayout = await page.evaluate(() => ({
    header: getComputedStyle(document.querySelector("header")!).display,
    footer: getComputedStyle(document.querySelector("footer")!).display,
    firstButton: getComputedStyle(document.querySelector("main")!.querySelector("button")!).display,
  }));
  expect(printLayout).toEqual({ header: "none", footer: "none", firstButton: "none" });
  const pdf = await page.pdf({ path: test.info().outputPath("fitting-brief.pdf"), format: "A4", printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(20_000);
  await page.emulateMedia({ media: "screen" });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();

  // The same link opens in a fresh page load (it is stored server-side, not in the session).
  await page.goto(page.url());
  await expect(page.getByRole("heading", { name: "Bring the looks you like." })).toBeVisible();
});

test("plan: with a first treatment date, the wig-ready step sits on that date", async ({ page }) => {
  await toResults(page, "Not yet", 1);
  await page.getByRole("link", { name: "Plan around the treatment dates" }).click();
  await expect(page.getByRole("heading", { name: "Plan around the treatment dates" })).toBeVisible();

  const first = isoInDays(14);
  await page.getByLabel("First treatment date (optional)").fill(first);
  await page.getByRole("button", { name: "Make my plan" }).click();

  const step = page.getByRole("listitem").filter({ has: page.locator(`time[datetime="${first}"]`) }).filter({ hasText: "Have your wig or wrap ready" });
  await expect(step).toBeVisible();
  await expect(page.getByText("Check details with your care team.")).toBeVisible();
  // No LLM keys in the test server: the rule-based planner says so plainly.
  await expect(page.getByText("We used our simple planner because the AI planner was unavailable.")).toBeVisible();
});

test("plan: when her hair is already gone, a plan still comes back and ends with the care-team line", async ({ page }) => {
  await toResults(page, "My hair is gone", 1);
  await page.getByRole("link", { name: "Plan around the treatment dates" }).click();
  await page.getByLabel("First treatment date (optional)").fill(isoInDays(14));
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Check details with your care team.")).toBeVisible();
});

test("honesty page carries the deletion line and the unit guardrail", async ({ page }) => {
  await page.goto("/how-we-tested");
  await expect(page.getByRole("heading", { name: "How we tested this" })).toBeVisible();
  await expect(page.getByText("Your try-ons are deleted from YouCam at the end of your session.").first()).toBeVisible();
  await expect(page.getByText(/YouCam units per visit/)).toBeVisible();
});

test("P3: no straight wig is labelled 'Close to her hair'", async ({ page }) => {
  await toResults(page, "My hair is gone", 3);
  await expect(cards(page)).toHaveCount(4);
  const texture = new Map(catalogue.filter((c) => c.kind === "wig").map((c) => [c.name, c.texture]));
  let straight = 0;
  for (let i = 0; i < 4; i++) {
    const card = cards(page).nth(i);
    const name = (await card.getByRole("heading", { level: 2 }).innerText()).trim();
    if (texture.get(name) !== "straight") continue;
    straight++;
    await expect(card.getByText(/^Close to her hair$/)).toHaveCount(0);
  }
  console.log(`P3: ${straight} straight wig(s) among the 4 cards`);
});
