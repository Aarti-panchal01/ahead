// GET /api/result?id=<taskId>: the finished render, streamed through our server so the browser can read its pixels
// same-origin (integrity check). Live tasks only if this deployment created them (the ledger knows the id).
// mock: ids redirect to /api/fixtures/<name>. The result URL and the key are never logged or returned.
// If the task's session has already ended, the task is deleted at YouCam right after the image has been read.
import { NextResponse } from "next/server";
import { deleteTask, getTask } from "@/lib/youcam/client";
import { fail } from "@/lib/youcam/http";
import { parsePublicUrl } from "@/lib/youcam/remote";
import { clearEnded, getCall, isEnded } from "@/lib/youcam/safety";
import { readMock } from "@/lib/youcam/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function download(rawUrl: string): Promise<{ bytes: Buffer; type: string } | null> {
  let url = parsePublicUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    // Plain GET to the result host: the YouCam key is never sent here.
    const r = await fetch(url, { redirect: "manual", headers: { Accept: "image/*" } });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      url = parsePublicUrl(new URL(loc, url).toString());
      continue;
    }
    if (!r.ok) return null;
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    return { bytes, type: (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() };
  }
  return null;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (id.startsWith("mock:")) {
    if (!readMock(id)) return fail("unknown_task", 404);
    return new Response(null, { status: 307, headers: { Location: `/api/fixtures/${id.slice(5)}`, "Cache-Control": "no-store" } });
  }
  if (!/^[A-Za-z0-9_.=-]{1,200}$/.test(id)) return fail("unknown_task", 404);
  if (!(await getCall(id))) return fail("unknown_task", 404);
  try {
    const t = await getTask("hair-transfer", id);
    if (t.status !== "success" || !t.url) return fail("result_unavailable", t.status === "running" ? 409 : 404);
    const img = await download(t.url);
    if (!img) return fail("result_unavailable", 502);
    if (await isEnded(id)) { await deleteTask(id); await clearEnded(id); }
    const type = ["image/jpeg", "image/png", "image/webp"].includes(img.type) ? img.type : "image/jpeg";
    return new NextResponse(new Uint8Array(img.bytes), { headers: { ...NO_STORE, "Content-Type": type } });
  } catch {
    return fail("result_unavailable", 502);
  }
}
