// GET /api/status: live-mode budget as UnitStatus ({ mode, servingRecordings, remainingToday?, reason? }).
// Never throws: if the store (Upstash) or YouCam is briefly unreachable, answer with the mock-safe status
// (recordings, reason "unavailable") so the UI keeps working.
import { NextResponse } from "next/server";
import { mode } from "@/lib/youcam";
import { getUnitStatus, type UnitStatusDetail } from "@/lib/youcam/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WAIT_MS = 4000;

export async function GET() {
  let status: UnitStatusDetail;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    status = await Promise.race([
      getUnitStatus(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), WAIT_MS); }),
    ]);
  } catch {
    const m = mode();
    status = { mode: m, servingRecordings: m === "live", reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
