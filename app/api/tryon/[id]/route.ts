// GET /api/tryon/[id]: one status check. The browser polls this until success or error.
import { NextResponse } from "next/server";
import type { TryOnResult } from "@/lib/types";
import { messageFor, readMock } from "@/lib/youcam";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id.startsWith("mock:")) {
    const s = readMock(id);
    if (!s) return NextResponse.json({ id, status: "error", errorCode: "unknown_task", message: messageFor() } satisfies TryOnResult, { status: 404 });
    const out: TryOnResult = s.status === "success"
      ? { id, status: "success", resultUrl: s.resultUrl, unitsCharged: 0 }
      : { id, status: "error", errorCode: s.errorCode, message: messageFor(s.errorCode), unitsCharged: 0 };
    return NextResponse.json(out);
  }
  const { getTask } = await import("@/lib/youcam/client");
  try {
    const t = await getTask("hair-transfer", id);
    const out: TryOnResult = t.status === "success" ? { id, status: "success", resultUrl: t.url }
      : t.status === "error" ? { id, status: "error", errorCode: t.errorCode, message: messageFor(t.errorCode), unitsCharged: 0 }
      : { id, status: "running" };
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ id, status: "running" } satisfies TryOnResult);
  }
}
