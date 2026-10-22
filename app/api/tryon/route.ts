// POST /api/tryon: start a wig or wrap try-on and return its task id. The browser polls GET /api/tryon/[id].
// Body: JSON { itemId, faceId } (a demo face, F1..F7) or multipart { itemId, selfie }.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getItem } from "@/lib/catalogue";
import type { TryOnJob } from "@/lib/types";
import { findRecording, messageFor, mockTaskId, mode } from "@/lib/youcam";

export const runtime = "nodejs";
const FACE = /^F[1-7]$/;

function fail(code: string, status = 422) {
  return NextResponse.json({ errorCode: code, message: messageFor(code) }, { status });
}

export async function POST(req: Request) {
  let itemId = "", faceId = "", selfie: Buffer | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    itemId = String(form.get("itemId") ?? "");
    const f = form.get("selfie");
    if (f && typeof f !== "string") selfie = Buffer.from(await f.arrayBuffer());
  } else {
    const body = await req.json().catch(() => ({}));
    itemId = String(body.itemId ?? "");
    faceId = String(body.faceId ?? "");
  }
  const item = getItem(itemId);
  if (!item) return fail("unknown_item", 400);
  if (!selfie && !FACE.test(faceId)) return fail("no_photo", 400);

  const m = mode();
  const job: TryOnJob = { id: "", itemId, mode: m, createdAt: new Date().toISOString() };

  if (m === "mock") {
    const rec = faceId ? findRecording(faceId, itemId) : null;
    if (!rec) return fail("no_recording");
    return NextResponse.json({ ...job, id: mockTaskId(rec) });
  }

  // Live. Photos with no person wearing the item fail with error_no_face (0 units), so don't send them.
  if (!item.usableAsReference) return fail("error_no_face");
  const { createHairTransfer, prepare, YoucamError } = await import("@/lib/youcam/client");
  try {
    const src = await prepare(selfie ?? fs.readFileSync(path.join(process.cwd(), "assets", "ai", "faces", `${faceId}.jpg`)));
    const ref = await prepare(fs.readFileSync(path.join(process.cwd(), "public", item.image)));
    const { taskId } = await createHairTransfer(src, ref);
    return NextResponse.json({ ...job, id: taskId });
  } catch (e) {
    if (e instanceof YoucamError) return fail(e.code, e.code === "reserve" ? 503 : 502);
    return fail("create_failed", 502);
  }
}
