// Small helpers shared by the API routes.
import { NextResponse } from "next/server";
import { YoucamError } from "./errors";
import { messageFor, type MessageContext } from "./messages";
import { readUpload } from "./images";
import { SESSION_ID } from "./safety";

export function fail(code: string, status = 422, context?: MessageContext) {
  return NextResponse.json({ errorCode: code, message: messageFor(code, context) }, { status });
}

/** Maps a thrown error to a plain JSON answer. Upload errors are 4xx, anything else is 500. */
export function failFrom(e: unknown) {
  if (e instanceof YoucamError) return fail(e.code, e.code === "too_large" ? 413 : 422);
  return fail("create_failed", 500);
}

/** Vercel sets x-forwarded-for; the first entry is the client. */
export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || req.headers.get("x-real-ip") || "unknown";
}

export function sessionId(req: Request): string | undefined {
  const s = req.headers.get("x-ahead-session") ?? undefined;
  return s && SESSION_ID.test(s) ? s : undefined;
}

export type Fields = { get(name: string): string | null; file(name: string): Promise<Buffer | null> };

/** Reads JSON or multipart bodies into one shape. Uploaded files are validated and re-encoded. */
export async function readBody(req: Request): Promise<Fields> {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      get: (n) => { const v = form.get(n); return typeof v === "string" ? v : null; },
      file: async (n) => { const v = form.get(n); return v && typeof v !== "string" ? readUpload(v) : null; },
    };
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    get: (n) => (typeof body[n] === "string" ? (body[n] as string) : null),
    file: async () => null,
  };
}
