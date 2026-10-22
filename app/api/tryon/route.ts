// POST /api/tryon: start a wig or wrap try-on and return its task id. The browser polls GET /api/tryon/[id].
// Body: JSON { itemId, faceId } or multipart { itemId, selfie } (faceId is a demo face: F1..F7, P1A..P4C, P1B_browsB).
// Header x-ahead-session (optional) lets POST /api/session/end forget this session's tasks.
// A demo face always gets its recording ({ recording: true, mode: "mock" }, 0 units), in any mode; no recording means
// no_recording, never a live call. Only an uploaded selfie may go live.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getItem } from "@/lib/catalogue";
import type { TryOnJob } from "@/lib/types";
import { findRecording, mockTaskId, mode } from "@/lib/youcam";
import { clientIp, fail, failFrom, readBody, sessionId } from "@/lib/youcam/http";
import { testerGate } from "@/lib/youcam/tester";
import { isDemoFace } from "@/lib/youcam/sources";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let itemId = "", faceId = "", selfie: Buffer | null = null, testerCode: string | null = null;
  try {
    const body = await readBody(req);
    testerCode = body.get("testerCode");
    itemId = body.get("itemId") ?? "";
    faceId = body.get("faceId") ?? "";
    selfie = await body.file("selfie");
  } catch (e) {
    return failFrom(e);
  }
  const item = getItem(itemId);
  if (!item) return fail("unknown_item", 400);
  if (!selfie && !isDemoFace(faceId)) return fail("no_photo", 400);

  const m = mode();
  const job: TryOnJob = { id: "", itemId, mode: m, createdAt: new Date().toISOString() };

  // A demo face (no uploaded selfie) never goes live, in any mode: it gets its recording at 0 units, or a plain no_recording.
  // Only an uploaded selfie may spend units.
  if (!selfie || m === "mock") {
    const rec = !selfie && faceId ? findRecording(faceId, itemId) : null;
    if (!rec) return fail("no_recording");
    return NextResponse.json({ ...job, mode: "mock", id: mockTaskId(rec), recording: true });
  }

  // Live on an uploaded selfie: needs the tester code when TESTER_CODE is set (before any YouCam call).
  const denied = testerGate(req, { get: () => testerCode });
  if (denied) return denied;

  // Live. Photos with no person wearing the item fail with error_no_face (0 units), so don't send them.
  if (!item.usableAsReference) return fail("error_no_face");
  const { startHairTransfer } = await import("@/lib/youcam/tryon");
  const { prepare } = await import("@/lib/youcam/client");
  try {
    const src = selfie;
    const ref = await prepare(fs.readFileSync(path.join(process.cwd(), "public", item.image)));
    const r = await startHairTransfer({ src, ref, ip: clientIp(req), sessionId: sessionId(req) });
    if (r.ok) return NextResponse.json({ ...job, id: r.taskId });
        return NextResponse.json({ errorCode: r.code, message: r.message }, { status: r.status });
  } catch (e) {
    return failFrom(e);
  }
}
