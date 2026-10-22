// The hero flow in mock mode (no YouCam call is ever made): landing to results, brows, wraps, compare, match card,
// stylist brief, plan, and the honesty page. Runs at 390x844 and 1280x800 (see playwright.config.ts).
import { expect, test } from "@playwright/test";
import catalogue from "../../catalogue/catalogue.json";
import { INTEGRITY_RE, cards, isoInDays, toResults, waitForChecked } from "./helpers";

test("landing shows the triptych, the tagline and both ways in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Try on your next hair, before you lose this");
  const triptych = page.getByRole("region", { name: "One person, three looks" });
  await expect(triptych.getByRole("img")).toHaveCount(3);
  for (const caption of ["Today", "Hair gone", "Wig and brows"]) await expect(triptych.getByText(caption)).toBeVisible();
  await expect(page.getByRole("link", { name: "Take one photo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try with a sample person" })).toBeVisible();
});

test("hero flow: consent, sample person, results with checks, brows, wraps, compare, match card, brief", async ({ page }) => {
  await toResults(page, "My hair is gone", 1);

  // 4 wig cards, each with her own recording and its integrity line.
  const lines = await waitForChecked(page, 4);
  // Record what the browser check said (it may say "couldn't run on this device" where WebGL is missing).
  test.info().annotations.push({ type: "integrity", description: lines.join(" | ") });
  console.log(`integrity lines: ${lines.join(" | ")}`);
  await expect(page.getByText("Shown on our model")).toHaveCount(0);
  await expect(page.getByText(/isn.t recorded/i)).toHaveCount(0);
  await expect(page.getByText("Getting her preview ready.")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await expect(cards(page).nth(i).getByRole("heading", { level: 3 })).not.toBeEmpty();

  // Brows toggle says what it does, and flips.
  await expect(page.getByRole("button", { name: "Show without brows" })).toBeVisible();
  await page.getByRole("button", { name: "Show without brows" }).click();
  await expect(page.getByRole("button", { name: "Show with brows" })).toBeVisible();
  await expect(cards(page).first().getByText(INTEGRITY_RE)).toBeVisible();
  await page.getByRole("button", { name: "Show with brows" }).click();
  await expect(page.getByRole("button", { name: "Show without brows" })).toBeVisible();
  await waitForChecked(page, 4);

  // Wraps tab: 4 wraps.
  await page.getByRole("tab", { name: "Wraps" }).click();
  await expect(page.getByRole("tab", { name: "Wraps" })).toHaveAttribute("aria-selected", "true");
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
  await cards(page).nth(0).getByRole("button", { name: "Add to compare" }).click();
  await expect(page.getByText("1 chosen. Add one more to compare.")).toBeVisible();
  await cards(page).nth(1).getByRole("button", { name: "Add to compare" }).click();
  await page.getByRole("button", { name: "Compare these two" }).click();
  await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await expect(page.getByRole("img", { name: /wearing the/i })).toHaveCount(2);
  await expect(page.getByText(INTEGRITY_RE)).toHaveCount(2, { timeout: 60_000 });
  await page.getByRole("button", { name: "Back to all matches" }).click();
  await expect(cards(page)).toHaveCount(4);

  // Stylist brief (POST /api/brief with the in-memory store), then the brief page.
  await page.getByRole("button", { name: "Make a brief for my stylist" }).click();
  await expect(page).toHaveURL(/\/brief\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Stylist brief" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Our model wearing the/ })).toHaveCount(2);
  await expect(page.getByText(/^This link stops working on .+\d{4}\.$/)).toBeVisible();

  // The same link opens in a fresh page load (it is stored server-side, not in the session).
  await page.goto(page.url());
  await expect(page.getByRole("heading", { name: "Stylist brief" })).toBeVisible();
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

test("honesty page carries the deletion line and the 30-unit guardrail line", async ({ page }) => {
  await page.goto("/how-we-tested");
  await expect(page.getByRole("heading", { name: "How we tested this" })).toBeVisible();
  await expect(page.getByText("Your try-ons are deleted from YouCam at the end of your session.").first()).toBeVisible();
  await expect(page.getByText(/at most 30 YouCam units per visit/)).toBeVisible();
});

test("P3: no straight wig is labelled 'Close to her hair'", async ({ page }) => {
  await toResults(page, "My hair is gone", 3);
  await expect(cards(page)).toHaveCount(4);
  const texture = new Map(catalogue.filter((c) => c.kind === "wig").map((c) => [c.name, c.texture]));
  let straight = 0;
  for (let i = 0; i < 4; i++) {
    const card = cards(page).nth(i);
    const name = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
    if (texture.get(name) !== "straight") continue;
    straight++;
    await expect(card.getByText(/^Close to her hair$/)).toHaveCount(0);
  }
  console.log(`P3: ${straight} straight wig(s) among the 4 cards`);
});
