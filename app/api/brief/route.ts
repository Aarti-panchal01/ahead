// POST /api/brief: save a stylist brief for 7 days and return it with its unguessable id.
// Body: JSON { items: string[] (catalogue ids), hairColour?: "#RRGGBB", browColour?: "#RRGGBB", notes?: string (max 500) }
// Answer 201: StylistBrief { id, createdAt, expiresAt, items, hairColour?, browColour?, notes? }. No photos, no accounts.
// Rate limited per IP (AHEAD_BRIEF_LIMIT_PER_HOUR, default 10).
import { NextResponse } from "next/server";
import { createBrief, parseBrief } from "@/lib/store/briefs";
import { getStore } from "@/lib/store";
import { clientIp, fail } from "@/lib/youcam/http";
import { ipHash } from "@/lib/youcam/safety";

export const runtime = "nodejs";

const limit = () => {
  const raw = process.env.AHEAD_BRIEF_LIMIT_PER_HOUR;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : 10;
};

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > 20_000) return fail("bad_brief", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return fail("bad_brief", 400); }
  const parsed = parseBrief(body);
  if (!parsed.ok) return fail("bad_brief", 400);
  try {
    const bucket = Math.floor(Date.now() / 3_600_000);
    const n = await getStore().incrBy(`rl:brief:${ipHash(clientIp(req))}:${bucket}`, 1, 3700);
    if (n > limit()) return fail("brief_rate_limit", 429);
    return NextResponse.json(await createBrief(parsed.value), { status: 201 });
  } catch {
    return fail("unavailable", 503);
  }
}
