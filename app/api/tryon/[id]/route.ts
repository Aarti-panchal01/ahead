// GET /api/tryon/[id]: one status check. The browser polls this until success or error.
// Add ?for=listing (mock tasks only) to get the listing wording for error_no_face; live tasks remember their own kind.
import { NextResponse } from "next/server";
import type { TryOnResult } from "@/lib/types";
import { messageFor, readMock } from "@/lib/youcam";

export const runtime = "nodejs";

const RECORDING_NOTE = "This is a recording, not a live render of your photo.";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const context = new URL(req.url).searchParams.get("for") === "listing" ? "listing" : undefined;
  if (id.startsWith("mock:")) {
    const s = readMock(id);
    if (!s) return NextResponse.json({ id, status: "error", errorCode: "unknown_task", message: messageFor("unknown_task") } satisfies TryOnResult, { status: 404 });
    const out: TryOnResult & { recording: true } = s.status === "success"
      ? { id, status: "success", resultUrl: s.resultUrl, unitsCharged: 0, recording: true, message: RECORDING_NOTE }
      : { id, status: "error", errorCode: s.errorCode, message: messageFor(s.errorCode, context), unitsCharged: 0, recording: true };
    return NextResponse.json(out);
  }
  if (!/^[A-Za-z0-9_.:=-]{1,200}$/.test(id)) {
    return NextResponse.json({ id, status: "error", errorCode: "unknown_task", message: messageFor("unknown_task") } satisfies TryOnResult, { status: 404 });
  }
  const { pollTask } = await import("@/lib/youcam/tryon");
  try {
    const t = await pollTask(id);
    const ctxName = t.kind === "listing" ? "listing" : context;
    const out: TryOnResult = t.status === "success" ? { id, status: "success", resultUrl: t.url }
      : t.status === "error" ? { id, status: "error", errorCode: t.errorCode, message: messageFor(t.errorCode, ctxName), unitsCharged: 0 }
      : { id, status: "running" };
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ id, status: "running" } satisfies TryOnResult);
  }
}
