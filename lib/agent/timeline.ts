// plan_timeline: deterministic, no LLM. Cosmetic planning only, never medical advice.
// Built only on these FACTS (the consult agent brief, FACTS list):
// - Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (MedlinePlus).
// - Choose a wig before hair loss, save a lock of hair, photograph your current style (MedlinePlus; Oncolink; ACS).
// - Wigs are hygiene-sensitive and usually returnable only unopened (retailer return policies).
// Dates are ISO "YYYY-MM-DD" in UTC. With no treatment date the wording is relative and steps carry no date.
import type { HairLossStage, TimelineItem } from "@/lib/types";

/** Day after the first treatment when hair loss often starts (1 week). */
export const WINDOW_START_DAY = 7;
/** Day by which it mostly has started (3 weeks). */
export const WINDOW_END_DAY = 21;
/**
 * Order this many days BEFORE the first treatment (day 0), so the wig or wrap is ready on day 0.
 * Why 7: a week covers ordinary delivery plus one exchange of an unopened wig (wigs are usually returnable only
 * unopened), and still lands before day 0. It is a planning margin, not a medical number.
 */
export const ORDER_DAYS_BEFORE = 7;

export const CARE_TEAM_LINE = "Check details with your care team.";
const RETURNS_NOTE = "Wigs are usually returnable only unopened, so try styles on here first.";
const SOURCE = "MedlinePlus";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in "YYYY-MM-DD", or null. */
export function parseIsoDate(s: string | undefined | null): Date | null {
  if (!s || !ISO.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const todayUtc = (now: Date) => new Date(`${toIso(now)}T00:00:00Z`);

export interface TimelineInput {
  stage: HairLossStage;
  firstTreatmentDate?: string;
  now?: Date;
}

export function planTimeline({ stage, firstTreatmentDate, now = new Date() }: TimelineInput): TimelineItem[] {
  const first = parseIsoDate(firstTreatmentDate);
  const today = todayUtc(now);
  const items: TimelineItem[] = [];

  if (stage === "not_yet") {
    items.push({
      ...(first ? { date: toIso(today) } : {}),
      label: "Choose your wig now",
      note: "Choose before hair loss starts. Save a lock of hair and photograph your current style.",
    });
    if (first) {
      const orderBy = addDays(first, -ORDER_DAYS_BEFORE);
      const start = addDays(first, WINDOW_START_DAY);
      const end = addDays(first, WINDOW_END_DAY);
      if (orderBy.getTime() >= today.getTime()) {
        items.push({
          date: toIso(orderBy),
          label: "Order your wig by this date",
          note: `${ORDER_DAYS_BEFORE} days before your first treatment leaves time for delivery and one exchange. ${RETURNS_NOTE}`,
        });
      } else {
        // Never an order-by date in the past.
        items.push({ date: toIso(today), label: "Order your wig as soon as you can", note: `So it is ready by ${toIso(first)}. ${RETURNS_NOTE}` });
      }
      items.push({
        date: toIso(first),
        label: "Have your wig or wrap ready",
        note: "Your first treatment day. Having it ready now means you choose calmly, before hair loss starts.",
      });
      items.push({
        date: toIso(start),
        label: "Hair loss often starts around here",
        note: `Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment: about ${toIso(start)} to ${toIso(end)} (${SOURCE}).`,
      });
    } else {
      items.push({ label: `Order your wig at least ${ORDER_DAYS_BEFORE} days before your first treatment`, note: RETURNS_NOTE });
      items.push({ label: "Have your wig or wrap ready by your first treatment", note: "Having it ready early means you choose calmly, before hair loss starts." });
      items.push({
        label: `Hair loss often starts ${WINDOW_START_DAY} to ${WINDOW_END_DAY} days after the first treatment`,
        note: `Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (${SOURCE}).`,
      });
    }
  } else {
    items.push({
      ...(first ? { date: toIso(today) } : {}),
      label: stage === "started" ? "Choose your wig or wrap now" : "Choose a wig or wrap when you are ready",
      note: stage === "started"
        ? "Photograph your current style and save a lock of hair if you can. It helps match the colour."
        : "Try wigs and head wraps on your own photo first, then choose.",
    });
    items.push({ label: "Order when you are ready", note: RETURNS_NOTE });
  }

  // Dated steps in date order; undated steps keep their order after them.
  const withDate = items.filter((i) => i.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const without = items.filter((i) => !i.date);
  return [...withDate, ...without, { label: CARE_TEAM_LINE }];
}
