// Stylist brief links. Contract (platform): POST /api/brief with { items, hairColour?, browColour?, notes? }
// returns a StylistBrief; GET /api/brief/[id] returns it, 404 when unknown, 410 when expired. No photos stored.
//
// LOCAL FALLBACK (this file only, for the orchestrator to remove once platform's routes are merged): when the
// POST route is missing (404/405), the brief is packed into the link itself ("l-" ids) with the same expiry rule,
// so the flow works end to end. Nothing is stored anywhere in that case.
import type { StylistBrief } from "@/lib/types";

export interface BriefDraft {
  items: string[];
  hairColour?: string;
  browColour?: string;
  notes?: string;
}

export const NOTES_MAX = 400;
/** Fallback links expire after this many days (platform decides its own expiry). */
export const LOCAL_TTL_DAYS = 7;
const LOCAL_PREFIX = "l-";
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,2000}$/;

export type CreateResult = { ok: true; brief: StylistBrief; local: boolean } | { ok: false; message: string };
export type GetResult =
  | { status: "ok"; brief: StylistBrief }
  | { status: "expired" | "missing" | "error"; message: string };

const EXPIRED = "This link has stopped working. Briefs expire to keep your details private. Make a new one from your matches.";
const MISSING = "We can't find this brief. Check the link, or make a new one from your matches.";

export function cleanDraft(d: BriefDraft): BriefDraft {
  return {
    items: [...new Set(d.items.filter((x) => /^[A-Z]\d{2}$/.test(x)))].slice(0, 8),
    hairColour: d.hairColour && HEX.test(d.hairColour) ? d.hairColour.toUpperCase() : undefined,
    browColour: d.browColour && HEX.test(d.browColour) ? d.browColour.toUpperCase() : undefined,
    notes: d.notes?.trim().slice(0, NOTES_MAX) || undefined,
  };
}

function isBrief(x: unknown): x is StylistBrief {
  const b = x as StylistBrief;
  return Boolean(b && typeof b.id === "string" && Array.isArray(b.items) && typeof b.expiresAt === "string");
}

function b64url(s: string): string {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function localBrief(d: BriefDraft, now = new Date()): StylistBrief {
  const c = cleanDraft(d);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + LOCAL_TTL_DAYS * 86_400_000).toISOString();
  const packed = b64url(JSON.stringify({ c: createdAt, e: expiresAt, i: c.items, h: c.hairColour, b: c.browColour, n: c.notes }));
  return { id: LOCAL_PREFIX + packed, createdAt, expiresAt, items: c.items, hairColour: c.hairColour, browColour: c.browColour, notes: c.notes };
}

function readLocal(id: string): StylistBrief | null {
  try {
    const o = JSON.parse(unb64url(id.slice(LOCAL_PREFIX.length)));
    const c = cleanDraft({ items: o.i ?? [], hairColour: o.h, browColour: o.b, notes: o.n });
    if (typeof o.c !== "string" || typeof o.e !== "string") return null;
    return { id, createdAt: o.c, expiresAt: o.e, items: c.items, hairColour: c.hairColour, browColour: c.browColour, notes: c.notes };
  } catch {
    return null;
  }
}

export async function createBrief(d: BriefDraft, fetchFn: typeof fetch = fetch, now = new Date()): Promise<CreateResult> {
  const body = cleanDraft(d);
  if (!body.items.length) return { ok: false, message: "Choose at least one wig or wrap first." };
  try {
    const r = await fetchFn("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 404 || r.status === 405) return { ok: true, brief: localBrief(body, now), local: true };
    const j = await r.json().catch(() => ({}));
    if (r.ok && isBrief(j)) return { ok: true, brief: j, local: false };
    return { ok: false, message: (j as { message?: string }).message || "We couldn't make the brief. Try again in a moment." };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

export async function getBrief(id: string, fetchFn: typeof fetch = fetch, now = new Date()): Promise<GetResult> {
  if (!ID.test(id)) return { status: "missing", message: MISSING };
  let brief: StylistBrief | null = null;
  if (id.startsWith(LOCAL_PREFIX)) {
    brief = readLocal(id);
    if (!brief) return { status: "missing", message: MISSING };
  } else {
    try {
      const r = await fetchFn(`/api/brief/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (r.status === 410) return { status: "expired", message: EXPIRED };
      if (r.status === 404) return { status: "missing", message: MISSING };
      const j = await r.json().catch(() => null);
      if (!r.ok || !isBrief(j)) return { status: "error", message: "We couldn't load this brief. Try again in a moment." };
      brief = j;
    } catch {
      return { status: "error", message: "We couldn't reach the server. Check your connection and try again." };
    }
  }
  if (new Date(brief.expiresAt).getTime() <= now.getTime()) return { status: "expired", message: EXPIRED };
  return { status: "ok", brief };
}

/** "This link stops working on 29 October 2026." */
export function expiryLine(expiresAt: string, locale?: string): string {
  const d = new Date(expiresAt);
  const day = d.toLocaleDateString(locale ?? "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `This link stops working on ${day}.`;
}
