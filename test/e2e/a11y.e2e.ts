// Accessibility: axe-core on every screen. Serious and critical violations fail the test; minor and moderate ones
// are printed and attached but do not fail. Violations are reported precisely (rule, impact, selector, summary),
// because fixing them belongs to the ui agent, not to qa.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cards, waitForChecked } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function audit(page: Page, screen: string) {
  // After a client-side navigation Next sets <title> a moment late; axe's document-title rule would flag that gap
  // (seen once on /brief on mobile, never when settled). Wait for it so only a real missing title fails.
  await expect(page).toHaveTitle(/\S/);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const lines = violations.flatMap((v) =>
    v.nodes.map((n) => `[${v.impact}] ${v.id} on ${screen}: ${n.target.join(" ")} :: ${(n.failureSummary ?? v.help).split("\n").slice(0, 2).join(" ").trim()}`),
  );
  for (const l of lines) console.log(`AXE ${l}`);
  if (violations.length) {
    await test.info().attach(`axe-${screen}.json`, { body: JSON.stringify(violations, null, 2), contentType: "application/json" });
  }
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `serious or critical axe violations on ${screen}`).toEqual([]);
}

test("axe: landing, consent, capture and the honesty page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start with my photo" })).toBeVisible();
  await audit(page, "landing");

  await page.getByRole("link", { name: "Start with my photo" }).click();
  await expect(page.getByRole("heading", { name: "Before you use your photo" })).toBeVisible();
  await audit(page, "consent");

  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await expect(page.getByRole("button", { name: "Use the camera" })).toBeVisible();
  await audit(page, "capture");

  await page.goto("/how-we-tested");
  await expect(page.getByRole("heading", { name: "How we tested this" })).toBeVisible();
  await audit(page, "honesty");
});

test("axe: results, brief and plan", async ({ page }) => {
  await page.goto("/results?person=P1&stage=gone");
  await expect(page.getByRole("heading", { name: /^Matches for sample person/i })).toBeVisible();
  await waitForChecked(page, 4);
  await audit(page, "results");

  await cards(page).first().getByRole("button", { name: "See the colour match" }).click();
  await expect(page.getByRole("region", { name: /^Colour match for the/ })).toBeVisible();
  await audit(page, "results-match-card");

  await page.getByRole("button", { name: "Create fitting brief" }).click();
  await expect(page.getByRole("heading", { name: "Bring the looks you like." })).toBeVisible();
  await expect(page.getByText(/^This link stops working on/).first()).toBeVisible();
  await audit(page, "brief");

  // Back to the results (client-side, the session is in memory), then the plan with a plan on screen.
  await page.goBack();
  await expect(page.getByRole("heading", { name: /^Matches for sample person/i })).toBeVisible();
  await page.getByRole("link", { name: "Plan around the treatment dates" }).click();
  await expect(page.getByRole("heading", { name: "Plan around the treatment dates" })).toBeVisible();
  await audit(page, "plan");
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await audit(page, "plan-with-timeline");
});
