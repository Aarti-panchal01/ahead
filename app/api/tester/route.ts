// POST /api/tester { code }: checks a tester code so the UI can store it (sessionStorage) before using it as
// header x-ahead-tester. 200 { ok: true } or 403 { errorCode: "tester_code", message }.
// Rate limited per IP (AHEAD_TESTER_TRIES_PER_HOUR, default 10) to stop guessing: 429 { errorCode: "tester_rate_limit" }.
// The code is never logged or returned. With no TESTER_CODE set there is nothing to check: 200 { ok: true }.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { clientIp, fail } from "@/lib/youcam/http";
import { ipHash } from "@/lib/youcam/safety";
import { codeMatches } from "@/lib/youcam/tester";

export const runtime = "nodejs";

const limit = () => {
  const raw = process.env.AHEAD_TESTER_TRIES_PER_HOUR;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : 10;
};

export async function POST(req: Request) {
  if (!process.env.TESTER_CODE) return NextResponse.json({ ok: true });
  let code = "";
  try {
    const j = (await req.json()) as { code?: unknown };
    if (typeof j.code === "string" && j.code.length <= 200) code = j.code;
  } catch { /* treated as a wrong code */ }
  try {
    const bucket = Math.floor(Date.now() / 3_600_000);
    const n = await getStore().incrBy(`rl:tester:${ipHash(clientIp(req))}:${bucket}`, 1, 3700);
    if (n > limit()) return fail("tester_rate_limit", 429);
  } catch {
    return fail("unavailable", 503);
  }
  return codeMatches(code) ? NextResponse.json({ ok: true }) : fail("tester_code", 403);
}
