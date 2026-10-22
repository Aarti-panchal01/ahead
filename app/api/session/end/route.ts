// POST /api/session/end: forget this session's tasks on our side.
// Header x-ahead-session identifies the session. YouCam documents NO delete endpoint for files or tasks
// (see docs/youcam-session-cleanup.md), so nothing is deleted at YouCam: files and tasks expire there after 30 days.
// What we do remove: the session's task list and the cache entries that point at its renders.
import { NextResponse } from "next/server";
import { cacheForgetTask, takeSession } from "@/lib/youcam/safety";
import { sessionId } from "@/lib/youcam/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sid = sessionId(req);
  if (!sid) return NextResponse.json({ errorCode: "no_session", message: "No session to end." }, { status: 400 });
  const ids = await takeSession(sid);
  for (const id of ids) await cacheForgetTask(id);
  return NextResponse.json({
    ended: true,
    forgotten: ids.length,
    deletedAtYoucam: false,
    note: "YouCam has no delete option. Photos and renders it holds are removed automatically after 30 days. We have forgotten them on our side.",
  });
}
