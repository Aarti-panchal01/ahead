// POST /api/session/end: end the session. Header x-ahead-session identifies it.
// Every live YouCam task the session created is deleted at YouCam (POST /s2s/v2.0/task/delete, verified 22 Oct 2026,
// see docs/youcam-session-cleanup.md), but only finished ones: each is polled first. Running tasks are left
// (they are put back on the session so a second end can finish them, and flagged so the result proxy deletes them
// right after the browser has read them). Mock ids never touch YouCam. Our own records are always cleared.
// Answer: { ended: true, deleted, skipped, failed, mock, forgotten, deletedAtYoucam, note }
import { NextResponse } from "next/server";
import { deleteTask, getTask } from "@/lib/youcam/client";
import { cacheForgetTask, markEnded, restoreSession, takeSession } from "@/lib/youcam/safety";
import { sessionId } from "@/lib/youcam/http";
import { endNote } from "@/lib/youcam/session";

export const runtime = "nodejs";

type One = "deleted" | "skipped" | "failed";

async function endOne(id: string): Promise<One> {
  try {
    const t = await getTask("hair-transfer", id);
    if (t.status === "running") return "skipped";
    const out = await deleteTask(id);
    if (out === "deleted" || out === "gone") return "deleted";
    return out === "not_finished" ? "skipped" : "failed";
  } catch {
    return "failed";
  }
}

export async function POST(req: Request) {
  const sid = sessionId(req);
  if (!sid) return NextResponse.json({ errorCode: "no_session", message: "No session to end." }, { status: 400 });
  const ids = await takeSession(sid);
  const live = ids.filter((id) => !id.startsWith("mock:"));
  const results = await Promise.all(live.map(async (id) => [id, await endOne(id)] as const));
  const count = (k: One) => results.filter(([, r]) => r === k).length;
  const running = results.filter(([, r]) => r === "skipped").map(([id]) => id);
  const undeleted = results.filter(([, r]) => r !== "deleted").map(([id]) => id);
  for (const id of undeleted) await markEnded(id);
  await restoreSession(sid, running);
  for (const id of ids) await cacheForgetTask(id);
  const n = { live: live.length, deleted: count("deleted"), skipped: count("skipped"), failed: count("failed") };
  return NextResponse.json({
    ended: true,
    deleted: n.deleted,
    skipped: n.skipped,
    failed: n.failed,
    mock: ids.length - live.length,
    forgotten: ids.length,
    deletedAtYoucam: n.live > 0 && n.skipped === 0 && n.failed === 0,
    note: endNote(n),
  });
}
