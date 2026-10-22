// POST /api/listing: preview a wig from a store listing photo (an upload or an https link) on your face.
// Body: multipart { listing (file) | listingUrl, faceId | selfie } or JSON { url, faceId }.
// Live: starts hair-transfer with the listing as the reference; poll GET /api/tryon/[id] (error_no_face is the honest refusal).
// Mock: no live call. Returns { status: "needs_live", message, exampleTaskId } where exampleTaskId replays the
// recorded no-one-wearing-it refusal (poll /api/tryon/<id>?for=listing).
import fs from "node:fs";
import { NextResponse } from "next/server";
import { findRecording, messageFor, mockTaskId, mode } from "@/lib/youcam";
import { clientIp, fail, failFrom, readBody, sessionId } from "@/lib/youcam/http";
import { prepareUpload } from "@/lib/youcam/images";
import { fetchRemoteImage, parsePublicUrl } from "@/lib/youcam/remote";
import { demoFacePath, isDemoFace } from "@/lib/youcam/sources";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let faceId = "", selfie: Buffer | null = null, listingFile: Buffer | null = null, url = "";
  try {
    const body = await readBody(req);
    faceId = body.get("faceId") ?? "";
    url = body.get("listingUrl") ?? body.get("url") ?? "";
    selfie = await body.file("selfie");
    listingFile = await body.file("listing");
    if (!listingFile && !url) return fail("no_listing", 400);
    if (!listingFile) parsePublicUrl(url); // syntax and obvious private addresses, no network
  } catch (e) {
    return failFrom(e);
  }
  if (!selfie && !isDemoFace(faceId)) return fail("no_photo", 400);

  if (mode() === "mock") {
    const rec = findRecording("F1", "W5");
    return NextResponse.json({
      status: "needs_live", mode: "mock", errorCode: "needs_live", message: messageFor("needs_live"),
      ...(rec ? { exampleTaskId: mockTaskId(rec), exampleNote: "A recorded example of a listing photo with no one wearing the wig." } : {}),
    });
  }

  const { startHairTransfer, servesRecording } = await import("@/lib/youcam/tryon");
  try {
    const ref = listingFile ?? (await prepareUpload(await fetchRemoteImage(url)));
    const src = selfie ?? (await prepareUpload(fs.readFileSync(demoFacePath(faceId))));
    const r = await startHairTransfer({ src, ref, ip: clientIp(req), sessionId: sessionId(req), kind: "listing" });
    if (r.ok) {
      return NextResponse.json({ id: r.taskId, mode: "live", kind: "listing", createdAt: new Date().toISOString(), pollUrl: `/api/tryon/${encodeURIComponent(r.taskId)}` });
    }
    return NextResponse.json({ errorCode: r.code, message: r.message, ...(servesRecording(r.reason) ? { reason: r.reason } : {}) }, { status: r.status });
  } catch (e) {
    return failFrom(e);
  }
}
