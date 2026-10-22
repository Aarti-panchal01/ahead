// GET /api/brief/[id]: the stylist brief, or 404 "This brief has expired or the link is wrong."
import { NextResponse } from "next/server";
import { getBrief } from "@/lib/store/briefs";
import { fail } from "@/lib/youcam/http";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const b = await getBrief(id);
    if (!b) return fail("brief_not_found", 404);
    return NextResponse.json(b, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch {
    return fail("unavailable", 503);
  }
}
