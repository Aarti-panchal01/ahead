// POST /api/agent/plan: PlanRequest -> PlanResponse (the consult agent).
// Header x-ahead-session is required: the 30-unit cap and the approval list are per session.
// Never runs a paid step: try-ons come back in pendingApproval and run only via POST /api/agent/approve.
import { NextResponse } from "next/server";
import { runPlan } from "@/lib/agent/agent";
import { warnMissingKeys } from "@/lib/agent/log";
import { plannerModels } from "@/lib/agent/providers";
import { APPROVE_MESSAGES } from "@/lib/agent/tryon";
import { parsePlanRequest } from "@/lib/agent/validate";
import { sessionId } from "@/lib/youcam/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const sid = sessionId(req);
  if (!sid) return NextResponse.json({ errorCode: "no_session", message: APPROVE_MESSAGES.no_session }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = parsePlanRequest(body);
  if (!parsed.ok) return NextResponse.json({ errorCode: "bad_request", message: parsed.message }, { status: 400 });
  warnMissingKeys();
  const plan = await runPlan(parsed.value, { sessionId: sid, models: plannerModels() });
  return NextResponse.json(plan);
}
