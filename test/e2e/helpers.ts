// Shared steps for the end-to-end tests. Selectors use roles and visible text, not class names.
import { expect, type Locator, type Page } from "@playwright/test";

export type StageLabel = "Not yet" | "It has started" | "My hair is gone";

/** Matches the integrity line on a card: "Skin tone check: ..." or "Corrected: ...". */
export const INTEGRITY_RE = /^(Skin tone check|Corrected):/;

/** Landing -> consent -> sample person -> "Has your hair loss started?" -> results (client-side navigation only,
 *  because the session lives in memory and a full page load starts over). */
export async function toResults(page: Page, stage: StageLabel, person = 1) {
  await page.goto("/");
  await page.getByRole("link", { name: "Take one photo" }).click();
  await page.getByRole("button", { name: "I agree, continue to my photo" }).click();
  await page.getByRole("button", { name: new RegExp(`^Choose Sample person ${person},`) }).click();
  await expect(page.getByRole("heading", { name: "Has your hair loss started?" })).toBeVisible();
  await page.getByRole("radio", { name: stage }).check();
  await page.getByRole("button", { name: "Show my matches" }).click();
  await expect(page.getByRole("heading", { name: /^Matches for sample person/i })).toBeVisible();
}

/** The result cards on the open tab. */
export const cards = (page: Page): Locator => page.getByRole("tabpanel").getByRole("article");

/** Waits until every card shows her render and an integrity line (or the plain "couldn't run" line). */
export async function waitForChecked(page: Page, count = 4): Promise<string[]> {
  await expect(cards(page)).toHaveCount(count);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards(page).nth(i);
    await expect(card.getByRole("img", { name: /wearing the/i }).first()).toBeVisible();
    const line = card.getByText(INTEGRITY_RE);
    await expect(line).toBeVisible({ timeout: 120_000 });
    lines.push((await line.first().innerText()).trim());
  }
  return lines;
}

/** Today plus n days as YYYY-MM-DD (UTC calendar day, like the planner reads it). */
export function isoInDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
