// GET /api/status: live-mode budget as UnitStatus ({ mode, servingRecordings, remainingToday?, reason? }).
import { NextResponse } from "next/server";
import { getUnitStatus } from "@/lib/youcam/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getUnitStatus(), { headers: { "Cache-Control": "no-store" } });
}
