// The plan screen's client. Contract (consult): POST /api/agent/plan with a PlanRequest returns a PlanResponse.
//
// LOCAL FALLBACK (this file only, for the orchestrator to check at merge): when the route is missing or answers
// with something that isn't a PlanResponse, a deterministic plan is built here from the FACTS only, with
// source "fallback", no paid steps and 0 units. Cosmetic language only; no treatment advice.
import { CATALOGUE } from "@/lib/catalogue";
import { rankCatalogue, type HairLength, type HairTexture } from "@/lib/rank";
import type { PlanRequest, PlanResponse, TimelineItem } from "@/lib/types";
import { getSample } from "./personas";

export const CARE_TEAM_LINE = "Check details with your care team.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" plus n days, in calendar days (UTC maths, so no daylight-saving drift). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Today in the user's own time zone, "YYYY-MM-DD". */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dated steps in calendar order; undated steps keep their order, after the dated ones. */
export function byDate(a: TimelineItem, b: TimelineItem): number {
  if (a.date && b.date) return a.date.localeCompare(b.date);
  return a.date ? -1 : b.date ? 1 : 0;
}

/** Plain words for the plan screen when the rule-based plan was used. */
export const FALLBACK_LINE = "We used our simple planner because the AI planner was unavailable.";

export function isPlanResponse(x: unknown): x is PlanResponse {
  const p = x as PlanResponse;
  return Boolean(
    p && Array.isArray(p.timeline) && p.timeline.every((t) => t && (t.date === undefined || typeof t.date === "string") && typeof t.label === "string")
      && Array.isArray(p.shortlist) && typeof p.brief === "string" && Array.isArray(p.messages)
      && (p.source === "llm" || p.source === "fallback") && typeof p.unitsUsed === "number",
  );
}

export function localPlan(req: PlanRequest, today: string): PlanResponse {
  const p = getSample(req.personaId);
  const hair = p?.hair ?? req.hairColour;
  const ranking = rankCatalogue(CATALOGUE, {
    hair,
    length: (req.preferences?.length ?? p?.length) as HairLength | undefined,
    texture: (req.preferences?.texture ?? p?.texture) as HairTexture | undefined,
  });
  const shortlist = [...ranking.wigs.map((r) => r.item.id), ranking.wraps[0]?.item.id].filter(Boolean) as string[];

  const t: TimelineItem[] = [];
  const gone = req.stage === "gone";
  t.push(
    gone
      ? { date: today, label: "Try on wigs, wraps and brows", note: "Compare a few side by side before you choose." }
      : { date: today, label: "Try on wigs while you still have your hair", note: "Photograph your current style and save a lock of hair for your stylist." },
  );
  const first = req.firstTreatmentDate && DATE.test(req.firstTreatmentDate) ? req.firstTreatmentDate : undefined;
  if (first && !gone) {
    const choose = addDays(first, -7);
    if (choose > today) t.push({ date: choose, label: "Choose your wig", note: "Wigs are usually returnable only unopened, so try them on here first." });
    t.push({ date: first, label: "Have your wig or a wrap ready", note: "Your first treatment date. Hair loss mostly starts 1 to 3 weeks after it." });
    t.push({ date: addDays(first, 21), label: "Brows and lashes", note: "Eyebrows and eyelashes can fall out too. You can try brows on here." });
  }
  t.sort(byDate);

  const names = shortlist.map((id) => CATALOGUE.find((x) => x.id === id)?.name).filter(Boolean);
  const brief = [
    "Stylist brief",
    hair ? `Hair colour read from a photo: ${hair.toUpperCase()} (approximate; colours on screens vary).` : "No hair colour read from the photo.",
    `Shortlist: ${names.join("; ")}.`,
    "I'll bring a lock of my hair to match the colour.",
  ].join("\n");

  const messages = [
    first || gone ? "Here is a simple plan for trying on and choosing." : "Add your first treatment date to see the steps on a calendar.",
    "MedlinePlus, Oncolink and the American Cancer Society suggest choosing a wig before hair loss and saving a lock of hair.",
    CARE_TEAM_LINE,
  ];

  return { timeline: t, shortlist, brief, messages, source: "fallback", unitsUsed: 0 };
}

export async function requestPlan(req: PlanRequest, fetchFn: typeof fetch = fetch, today = todayIso(), headers: Record<string, string> = {}): Promise<PlanResponse> {
  try {
    const r = await fetchFn("/api/agent/plan", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(req) });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      if (isPlanResponse(j)) return j;
    }
  } catch {
    /* fall through to the local plan */
  }
  return localPlan(req, today);
}

/** The plan screen always ends its plan with the care-team line, whoever wrote the messages. */
export function withCareTeamLine(messages: string[]): string[] {
  return messages.some((m) => m.includes(CARE_TEAM_LINE)) ? messages : [...messages, CARE_TEAM_LINE];
}
