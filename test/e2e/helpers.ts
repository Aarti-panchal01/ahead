// Shared steps for the end-to-end tests. Selectors use roles and visible text, not class names.
import { expect, type Locator, type Page } from "@playwright/test";

export type StageLabel = "Not yet" | "It has started" | "My hair is gone";

/** Matches the integrity line on a card: "Skin tone check: ..." or "Corrected: ...". */
export const INTEGRITY_RE = /^(Skin tone check|Corrected):/;

/** Open a deterministic sample lookbook directly; the sample selector was removed from the product journey. */
export async function toResults(page: Page, stage: StageLabel, person = 1) {
  const id = `P${person}`;
  const stageValue = stage === "Not yet" ? "not_yet" : stage === "It has started" ? "started" : "gone";
  await page.goto(`/results?person=${id}&stage=${stageValue}`);
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
    // Lower cards load their image and run their check only near the viewport (lazy loading), so scroll to each.
    await card.scrollIntoViewIfNeeded();
    // The result is deliberately hidden while the face restore and skin integrity pass run.
    // MediaPipe is serialized across cards and can take >20 s on a loaded desktop runner.
    await expect(card.getByRole("img", { name: /wearing the/i }).first()).toBeVisible({ timeout: 120_000 });
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
