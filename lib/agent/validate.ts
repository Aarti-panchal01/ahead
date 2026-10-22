// PlanRequest validation for POST /api/agent/plan.
import { z } from "zod";
import type { PlanRequest } from "@/lib/types";
import { parseIsoDate } from "./timeline";

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
});

export type ParseResult = { ok: true; value: PlanRequest } | { ok: false; message: string };

export function parsePlanRequest(body: unknown): ParseResult {
  // Empty strings from forms mean "not given".
  if (body && typeof body === "object") {
    const b = { ...(body as Record<string, unknown>) };
    for (const k of ["firstTreatmentDate", "personaId", "hairColour"]) if (b[k] === "" || b[k] === null) delete b[k];
    body = b;
  }
  const r = PlanRequestSchema.safeParse(body);
  if (r.success) return { ok: true, value: r.data as PlanRequest };
  const first = r.error.issues[0];
  return { ok: false, message: first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request" };
}
