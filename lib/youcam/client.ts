// Live YouCam client, ported from reference/killtest/youcam_client.py.
// Server only: the key comes from YOUCAM_API_KEY and is never returned or logged.
// Rules (docs/api-truth-table.md): upload via /s2s/v2.0/file, then create, then the browser polls.
// A create is never retried automatically. Errors can arrive inside HTTP 200 with task_status "error" (0 units).
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

export const BASE = "https://yce-api-01.makeupar.com";
/** Units kept back for judges (Nov 3 to 20). A paid call that would go below this is refused. */
export const RESERVE_UNITS = 150;

export const FEATURES = {
  "hair-transfer": { version: "v2.1", units: 2 },
} as const;
export type Feature = keyof typeof FEATURES;

function key(): string {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new YoucamError("missing_key", "Live mode needs YOUCAM_API_KEY on the server.");
  return k;
}
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });

export class YoucamError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** JPG, long side at most 1024 (hair-transfer limit). */
export async function prepare(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 93 }).toBuffer();
}

export async function balance(): Promise<number> {
  const r = await fetch(`${BASE}/s2s/v1.0/client/credit`, { headers: headers() });
  const j = (await r.json()) as { results?: { amount_dec?: number; amount?: number }[] };
  return (j.results ?? []).reduce((s, x) => s + Number(x.amount_dec ?? x.amount ?? 0), 0);
}

export async function upload(bytes: Buffer, name: string): Promise<string> {
  const r = await fetch(`${BASE}/s2s/v2.0/file`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ files: [{ content_type: "image/jpg", file_name: name, file_size: bytes.length }] }),
  });
  const j = await r.json();
  const f = j?.data?.files?.[0];
  if (!f?.file_id) throw new YoucamError("upload_failed", "We couldn't upload the photo. Try again in a moment.");
  const req = f.requests[0];
  const put = await fetch(req.url, { method: "PUT", headers: req.headers ?? { "Content-Type": "image/jpg" }, body: new Uint8Array(bytes) });
  if (!put.ok) throw new YoucamError("upload_failed", "We couldn't upload the photo. Try again in a moment.");
  return f.file_id as string;
}

// ---------- ledger and cache (per server instance; /tmp on Vercel) ----------
const DIR = path.join(os.tmpdir(), "still-me");
const LEDGER = path.join(DIR, "ledger.json");
interface Ledger { spent: number; calls: { at: string; feature: string; taskId: string; units: number }[] }
export function readLedger(): Ledger {
  try { return JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch { return { spent: 0, calls: [] }; }
}
function writeLedger(l: Ledger) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2)); }

export function cacheKey(...parts: (Buffer | string)[]): string {
  const h = createHash("sha256");
  for (const p of parts) { h.update(p); h.update("|"); }
  return h.digest("hex");
}
const cachePath = (k: string) => path.join(DIR, "cache", `${k}.json`);
export function cacheGet(k: string): string | null {
  try { return JSON.parse(fs.readFileSync(cachePath(k), "utf8")).taskId; } catch { return null; }
}
function cachePut(k: string, taskId: string) {
  fs.mkdirSync(path.dirname(cachePath(k)), { recursive: true });
  fs.writeFileSync(cachePath(k), JSON.stringify({ taskId, at: new Date().toISOString() }));
}

/** Create a hair-transfer task. Returns the task id; the browser polls getTask. Never retried. */
export async function createHairTransfer(src: Buffer, ref: Buffer): Promise<{ taskId: string; cached: boolean }> {
  const params = { hair_color: "ref" as const };
  const k = cacheKey(src, ref, JSON.stringify(params));
  const hit = cacheGet(k);
  if (hit) return { taskId: hit, cached: true };
  const units = FEATURES["hair-transfer"].units;
  const bal = await balance();
  if (bal - units < RESERVE_UNITS) throw new YoucamError("reserve", "Live try-on is paused to keep units for judging. The demo still works.");
  const payload = { src_file_id: await upload(src, "src.jpg"), ref_file_id: await upload(ref, "ref.jpg"), ...params };
  const r = await fetch(`${BASE}/s2s/v2.1/task/hair-transfer`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
  const j = await r.json();
  const taskId = j?.data?.task_id as string | undefined;
  if (!taskId) throw new YoucamError(j?.error_code ?? "create_failed", "The try-on couldn't start. Try again.");
  cachePut(k, taskId);
  const l = readLedger();
  l.spent += units; // provisional: charged only on success, corrected when the task ends in error
  l.calls.push({ at: new Date().toISOString(), feature: "hair-transfer", taskId, units });
  writeLedger(l);
  return { taskId, cached: false };
}

export interface TaskState { status: "running" | "success" | "error"; url?: string; errorCode?: string }

export async function getTask(feature: Feature, taskId: string): Promise<TaskState> {
  const v = FEATURES[feature].version;
  const r = await fetch(`${BASE}/s2s/${v}/task/${feature}/${encodeURIComponent(taskId)}`, { headers: headers() });
  const j = await r.json();
  const d = j?.data ?? {};
  if (d.task_status === "success") {
    const res = d.results;
    const url = Array.isArray(res) ? res[0]?.url : res?.url;
    return { status: "success", url };
  }
  if (d.task_status === "error") {
    const l = readLedger();
    const c = l.calls.find((x) => x.taskId === taskId && x.units > 0);
    if (c) { l.spent -= c.units; c.units = 0; writeLedger(l); } // errors cost 0 units
    return { status: "error", errorCode: d.error ?? "unknown_error" };
  }
  return { status: "running" };
}
