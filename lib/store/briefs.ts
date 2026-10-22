// Stylist briefs: no accounts, no photos. A brief is a short list of catalogue ids, two colours and a note,
// stored under an unguessable id with a 7 day expiry.
import { randomBytes } from "node:crypto";
import { getItem } from "@/lib/catalogue";
import type { StylistBrief } from "@/lib/types";
import { getStore } from "./index";

export const BRIEF_TTL_S = 7 * 86400;
export const BRIEF_ID = /^[A-Za-z0-9_-]{16,64}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
export const MAX_NOTES = 500;
export const MAX_ITEMS = 20;

export const newBriefId = () => randomBytes(18).toString("base64url"); // 24 url-safe chars, 144 bits

type Fields = Omit<StylistBrief, "id" | "createdAt" | "expiresAt">;
export type BriefInput = { ok: true; value: Fields } | { ok: false };

// Control characters other than tab and newline.
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

/** Validates the request body. Never trusts types. */
export function parseBrief(body: unknown): BriefInput {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) return { ok: false };
  const items: string[] = [];
  for (const i of b.items) {
    if (typeof i !== "string" || !getItem(i)) return { ok: false };
    if (!items.includes(i)) items.push(i);
  }
  const out: Fields = { items };
  for (const k of ["hairColour", "browColour"] as const) {
    if (b[k] === undefined || b[k] === null || b[k] === "") continue;
    if (typeof b[k] !== "string" || !HEX.test(b[k] as string)) return { ok: false };
    out[k] = (b[k] as string).toUpperCase();
  }
  if (b.notes !== undefined && b.notes !== null) {
    if (typeof b.notes !== "string") return { ok: false };
    const notes = b.notes.replace(CONTROL, "").trim(); // plain text only
    if (notes.length > MAX_NOTES) return { ok: false };
    if (notes) out.notes = notes;
  }
  return { ok: true, value: out };
}

export async function createBrief(v: Fields, now = Date.now()): Promise<StylistBrief> {
  const brief: StylistBrief = {
    id: newBriefId(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + BRIEF_TTL_S * 1000).toISOString(),
    ...v,
  };
  await getStore().set(`brief:${brief.id}`, JSON.stringify(brief), BRIEF_TTL_S);
  return brief;
}

export async function getBrief(id: string, now = Date.now()): Promise<StylistBrief | null> {
  if (!BRIEF_ID.test(id)) return null;
  const raw = await getStore().get(`brief:${id}`);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as StylistBrief;
    return Date.parse(b.expiresAt) > now ? b : null;
  } catch { return null; }
}
