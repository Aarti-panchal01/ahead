// PlanRequest validation for POST /api/agent/plan.
import { z } from "zod";
import type { PlanRequest } from "@/lib/types";
import { addDays, parseIsoDate, toIso } from "./timeline";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const short = z.string().trim().max(40);

export const PlanRequestSchema = z.object({
  stage: z.enum(["not_yet", "started", "gone"]),
  firstTreatmentDate: z.string().refine((s) => parseIsoDate(s) !== null, "firstTreatmentDate must be a real date, YYYY-MM-DD").optional(),
  personaId: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  hairColour: z.string().regex(HEX, "hairColour must be #RRGGBB").optional(),
  preferences: z.object({
    length: short.optional(),
    texture: short.optional(),
    wantsWraps: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  }).optional(),

  /** The person's local date, "YYYY-MM-DD", so "today" on the timeline is their day, not the server's UTC day. */
  today: z.string().refine((s) => parseIsoDate(s) !== null, "today must be a real date, YYYY-MM-DD").optional(),
});

/** PlanRequest plus the optional client-local `today` (until lib/types.ts carries it). */
export type PlanRequestIn = PlanRequest & { today?: string };

export type ParseResult = { ok: true; value: PlanRequestIn } | { ok: false; message: string };

/**
 * The timeline's "now": the client's local date when it is plausible (within one day of the server's UTC date,
 * which covers every time zone), else the server's UTC date. Noon UTC so the ISO date is exactly that day.
 */
export function timelineNow(today: string | undefined, serverNow: Date = new Date()): Date {
  const d = parseIsoDate(today);
  if (!d) return serverNow;
  const server = toIso(serverNow);
  const ok = [toIso(addDays(d, -1)), toIso(d), toIso(addDays(d, 1))].includes(server);
  return ok ? new Date(`${toIso(d)}T12:00:00Z`) : serverNow;
}

export function parsePlanRequest(body: unknown): ParseResult {
  // Empty strings from forms mean "not given".
  if (body && typeof body === "object") {
    const b = { ...(body as Record<string, unknown>) };
    for (const k of ["firstTreatmentDate", "personaId", "hairColour", "today"]) if (b[k] === "" || b[k] === null) delete b[k];
    body = b;
  }
  const r = PlanRequestSchema.safeParse(body);
  if (r.success) return { ok: true, value: r.data as PlanRequestIn };
  const first = r.error.issues[0];
  return { ok: false, message: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request" };
}
