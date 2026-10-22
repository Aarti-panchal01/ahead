// POST /api/tryon: start a wig or wrap try-on and return its task id. The browser polls GET /api/tryon/[id].
// Body: JSON { itemId, faceId } or multipart { itemId, selfie } (faceId is a demo face: F1..F7, P1A..P4C, P1B_browsB).
// Header x-ahead-session (optional) lets POST /api/session/end forget this session's tasks.
// Live mode: when the daily cap or the judging reserve is reached, a matching recording is served and labelled
// ({ recording: true, mode: "mock" }); otherwise a plain message.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getItem } from "@/lib/catalogue";
import type { TryOnJob } from "@/lib/types";
import { findRecording, mockTaskId, mode } from "@/lib/youcam";
import { clientIp, fail, failFrom, readBody, sessionId } from "@/lib/youcam/http";
import { demoFacePath, isDemoFace } from "@/lib/youcam/sources";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let itemId = "", faceId = "", selfie: Buffer | null = null;
  try {
    const body = await readBody(req);
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

  if (m === "mock") {
    const rec = !selfie && faceId ? findRecording(faceId, itemId) : null;
    if (!rec) return fail("no_recording");
    return NextResponse.json({ ...job, id: mockTaskId(rec), recording: true });
  }

  // Live. Photos with no person wearing the item fail with error_no_face (0 units), so don't send them.
  if (!item.usableAsReference) return fail("error_no_face");
  const { startHairTransfer, servesRecording } = await import("@/lib/youcam/tryon");
  const { prepare } = await import("@/lib/youcam/client");
  try {
    const src = selfie ?? (await prepare(fs.readFileSync(demoFacePath(faceId))));
    const ref = await prepare(fs.readFileSync(path.join(process.cwd(), "public", item.image)));
    const r = await startHairTransfer({ src, ref, ip: clientIp(req), sessionId: sessionId(req) });
    if (r.ok) return NextResponse.json({ ...job, id: r.taskId });
    const rec = !selfie && faceId && servesRecording(r.reason) ? findRecording(faceId, itemId) : null;
    if (rec) {
      return NextResponse.json({ ...job, mode: "mock", id: mockTaskId(rec), recording: true, reason: r.reason, message: r.message });
    }
    return NextResponse.json({ errorCode: r.code, message: r.message }, { status: r.status });
  } catch (e) {
    return failFrom(e);
  }
}
