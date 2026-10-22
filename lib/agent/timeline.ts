// plan_timeline: deterministic, no LLM. Cosmetic planning only, never medical advice.
// Built only on these FACTS (.claude/agents/consult.md):
// - Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (MedlinePlus).
// - Choose a wig before hair loss, save a lock of hair, photograph your current style (MedlinePlus; Oncolink; ACS).
// - Wigs are hygiene-sensitive and usually returnable only unopened (retailer return policies).
// Dates are ISO "YYYY-MM-DD" in UTC. With no treatment date the wording is relative and date is "" (undated).
import type { HairLossStage, TimelineItem } from "@/lib/types";

/** Day after the first treatment when hair loss often starts (1 week). */
export const WINDOW_START_DAY = 7;
/** Day by which it mostly has started (3 weeks). */
export const WINDOW_END_DAY = 21;
/** Order before the window opens. */
export const ORDER_BY_DAY = WINDOW_START_DAY - 1;

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
  const dated = (d: Date | null) => (d ? toIso(d) : "");

  if (stage === "not_yet") {
    items.push({
      date: dated(first ? today : null),
      label: "Choose your wig now",
      note: "Choose before hair loss starts. Save a lock of hair and photograph your current style.",
    });
    if (first) {
      const orderBy = addDays(first, ORDER_BY_DAY);
      const start = addDays(first, WINDOW_START_DAY);
      const end = addDays(first, WINDOW_END_DAY);
      if (orderBy.getTime() >= today.getTime()) {
        items.push({ date: toIso(orderBy), label: "Order your wig by this date", note: `This is before day ${WINDOW_START_DAY} after your first treatment. ${RETURNS_NOTE}` });
      } else {
        items.push({ date: toIso(today), label: "Order your wig soon", note: `Hair loss often starts from ${toIso(start)}. ${RETURNS_NOTE}` });
      }
      items.push({
        date: toIso(start),
        label: "Hair loss often starts around here",
        note: `Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment: about ${toIso(start)} to ${toIso(end)} (${SOURCE}).`,
      });
    } else {
      items.push({ date: "", label: `Order your wig within ${ORDER_BY_DAY} days of your first treatment`, note: RETURNS_NOTE });
      items.push({
        date: "",
        label: `Hair loss often starts ${WINDOW_START_DAY} to ${WINDOW_END_DAY} days after the first treatment`,
        note: `Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (${SOURCE}).`,
      });
    }
  } else {
    items.push({
      date: dated(first ? today : null),
      label: stage === "started" ? "Choose your wig or wrap now" : "Choose a wig or wrap when you are ready",
      note: stage === "started"
        ? "Photograph your current style and save a lock of hair if you can. It helps match the colour."
        : "Try wigs and head wraps on your own photo first, then choose.",
    });
    items.push({ date: "", label: "Order when you are ready", note: RETURNS_NOTE });
  }

  // Dated steps in date order; undated steps keep their order after them.
  const withDate = items.filter((i) => i.date).sort((a, b) => a.date.localeCompare(b.date));
  const without = items.filter((i) => !i.date);
  return [...withDate, ...without, { date: "", label: CARE_TEAM_LINE }];
}
