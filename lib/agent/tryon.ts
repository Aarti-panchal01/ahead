// try_on: PAID (hair-transfer, 2 units). The agent never runs it. It only proposes pendingApproval steps;
// the user approves one at a time through POST /api/agent/approve, which runs it through the existing
// REST try-on path (POST /api/tryon -> lib/youcam/tryon: ledger, cache, judging reserve, daily cap,
// recordings, end-of-session delete) and counts it against the 30-unit session cap.
import { NextResponse } from "next/server";
import { getItem } from "@/lib/catalogue";
import { FEATURES } from "@/lib/youcam/client";
import { sessionId as readSessionId } from "@/lib/youcam/http";
import {
  claimUnits, getPending, releaseUnits, restorePending, SESSION_CAP_UNITS, takePending, unitsUsed, type PendingStep,
} from "./budget";

export const TRYON_UNITS: number = FEATURES["hair-transfer"].units;
/** "Try top 3" (CLAUDE.md, Agent flow). */
export const MAX_PROPOSED = 3;

/** Up to 3 try-on steps for usable items that still fit under the session cap. Nothing is run. */
export function proposeTryOns(itemIds: string[], used: number): PendingStep[] {
  const out: PendingStep[] = [];
  for (const id of itemIds) {
    if (out.length >= MAX_PROPOSED) break;
    const item = getItem(id);
    if (!item || !item.usableAsReference || out.some((p) => p.itemId === id)) continue;
    if (used + TRYON_UNITS * (out.length + 1) > SESSION_CAP_UNITS) break;
    out.push({ tool: "try_on", itemId: id, units: TRYON_UNITS });
  }
  return out;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export const APPROVE_MESSAGES = {
  no_session: "This page lost its session. Reload the page and try again.",
  not_proposed: "That try-on wasn't offered in your plan. Make a plan first, then approve one of its try-ons.",
  session_cap: `This session has used its ${SESSION_CAP_UNITS} try-on units. Saved recordings still work.`,
  bad_request: "Send the wig or wrap id you approved.",
} as const;

export type TryOnHandler = (req: Request) => Promise<Response>;

/**
 * Runs ONE approved try-on. Body: the same as POST /api/tryon (JSON { itemId, faceId } or multipart
 * { itemId, selfie }). The item must be one the plan proposed for this session.
 * Units count against the cap only when a live render was started (not a recording or an error).
 */
export async function approveTryOn(req: Request, runTryOn: TryOnHandler): Promise<Response> {
  const sid = readSessionId(req);
  if (!sid) return json({ errorCode: "no_session", message: APPROVE_MESSAGES.no_session }, 400);

  const body = await req.arrayBuffer();
  const contentType = req.headers.get("content-type") ?? "";
  let itemId = "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const v = (await new Request(req.url, { method: "POST", headers: { "content-type": contentType }, body }).formData()).get("itemId");
      itemId = typeof v === "string" ? v : "";
    } else {
      const j = JSON.parse(new TextDecoder().decode(body) || "{}") as { itemId?: unknown };
      itemId = typeof j.itemId === "string" ? j.itemId : "";
    }
  } catch { /* handled below */ }
  if (!itemId) return json({ errorCode: "bad_request", message: APPROVE_MESSAGES.bad_request }, 400);

  const step = await takePending(sid, itemId);
  if (!step) return json({ errorCode: "not_proposed", message: APPROVE_MESSAGES.not_proposed, unitsUsed: await unitsUsed(sid) }, 403);

  if (!(await claimUnits(sid, step.units))) {
    await restorePending(sid, step);
    return json({ errorCode: "session_cap", message: APPROVE_MESSAGES.session_cap, unitsUsed: await unitsUsed(sid) }, 429);
  }

  let res: Response;
  try {
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    res = await runTryOn(new Request(new URL("/api/tryon", req.url), { method: "POST", headers, body }));
  } catch {
    await releaseUnits(sid, step.units);
    await restorePending(sid, step);
    return json({ errorCode: "create_failed", message: "The try-on couldn't start. Try again.", unitsUsed: await unitsUsed(sid) }, 500);
  }

  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // Charged only when YouCam started a live render. A cache hit also lands here and is counted (we can't tell): safe side.
  const charged = res.ok && out.mode === "live" && out.recording !== true;
  if (!charged) await releaseUnits(sid, step.units);
  if (!res.ok) await restorePending(sid, step);
  return json({ ...out, unitsCharged: charged ? step.units : 0, unitsUsed: await unitsUsed(sid), pendingApproval: await getPending(sid) }, res.status);
}
