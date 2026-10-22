// API guard rails that need no Node APIs: never cache API answers, and turn away oversize uploads early.
import { NextResponse, type NextRequest } from "next/server";

const MAX_BODY = 11 * 1024 * 1024; // 10 MB photo plus form overhead

export function middleware(req: NextRequest) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (req.method === "POST" && len > MAX_BODY) {
    return NextResponse.json({ errorCode: "too_large", message: "That photo is too large. Use one under 10 MB." }, { status: 413 });
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = { matcher: "/api/:path*" };
