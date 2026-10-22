// GET /api/fixtures/[name]: the recorded render for a mock task (AI-generated people only).
import fs from "node:fs";
import path from "node:path";
import { fixturesDir } from "@/lib/youcam";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return new Response("Not found", { status: 404 });
  const p = path.join(fixturesDir(), `${name}.jpg`);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(p)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
