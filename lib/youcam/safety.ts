// Live-mode safety: persistent ledger, cache, daily unit cap and per-IP rate limit.
// Everything lives in the Store (Upstash Redis in production, memory in tests and when Upstash is not configured).
import { createHash } from "node:crypto";
import { getStore } from "@/lib/store";

/** Units kept back for judges (Nov 3 to 20). A paid call that would go below this is refused. */
export const RESERVE_UNITS = 150;

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : d;
};
export const limits = () => ({
  dailyCap: num(process.env.AHEAD_DAILY_UNIT_CAP, 20),
  ipPerHour: num(process.env.AHEAD_IP_LIMIT_PER_HOUR, 10),
  reserve: RESERVE_UNITS,
});

const DAY_S = 86400;
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const unitsKey = (day: string) => `units:day:${day}`;

export function cacheKey(...parts: (Buffer | string)[]): string {
  const h = createHash("sha256");
  for (const p of parts) { h.update(p); h.update("|"); }
  return h.digest("hex");
}

// ---------- rate limit ----------
export const ipHash = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 24);

/** Counts one live attempt for this IP. False when the hourly limit is exceeded. */
export async function allowIp(ip: string, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now / 3_600_000);
  const n = await getStore().incrBy(`rl:${ipHash(ip)}:${bucket}`, 1, 3700);
  return n <= limits().ipPerHour;
}

// ---------- daily cap ----------
/** Atomically claims units against today's cap. False (and nothing claimed) when it would exceed the cap. */
export async function claimDaily(units: number, day = dayKey()): Promise<boolean> {
  const s = getStore();
  const total = await s.incrBy(unitsKey(day), units, 2 * DAY_S);
  if (total > limits().dailyCap) { await s.incrBy(unitsKey(day), -units, 2 * DAY_S); return false; }
  return true;
}
export async function releaseDaily(units: number, day = dayKey()) {
  await getStore().incrBy(unitsKey(day), -units, 2 * DAY_S);
}
export async function usedToday(day = dayKey()): Promise<number> {
  return Number((await getStore().get(unitsKey(day))) ?? 0);
}

// ---------- ledger ----------
export interface LedgerCall {
  at: string;
  feature: string;
  taskId: string;
  units: number;
  day: string;
  kind: "tryon" | "listing";
  cacheKey?: string;
}
const callKey = (taskId: string) => `ledger:call:${taskId}`;
const CALL_TTL = 35 * DAY_S;

export async function recordCall(c: LedgerCall) {
  const s = getStore();
  await s.set(callKey(c.taskId), JSON.stringify(c), CALL_TTL);
  await s.push("ledger:calls", JSON.stringify(c), 500);
  await s.incrBy("ledger:spent", c.units);
}
export async function getCall(taskId: string): Promise<LedgerCall | null> {
  const v = await getStore().get(callKey(taskId));
  try { return v ? (JSON.parse(v) as LedgerCall) : null; } catch { return null; }
}
export async function totalSpent(): Promise<number> {
  return Number((await getStore().get("ledger:spent")) ?? 0);
}

/** A task ended in error: errors cost 0 units, so give the units back. Safe to call on every poll. */
export async function refundTask(taskId: string): Promise<boolean> {
  const c = await getCall(taskId);
  if (!c || c.units <= 0) return false;
  const s = getStore();
  await s.set(callKey(taskId), JSON.stringify({ ...c, units: 0 }), CALL_TTL);
  await s.incrBy("ledger:spent", -c.units);
  await releaseDaily(c.units, c.day);
  return true;
}

// ---------- cache (source + reference + params -> task id) ----------
const CACHE_TTL = 7 * DAY_S;
export async function cacheGet(key: string): Promise<string | null> {
  return getStore().get(`cache:${key}`);
}
export async function cachePut(key: string, taskId: string) {
  const s = getStore();
  await s.set(`cache:${key}`, taskId, CACHE_TTL);
  await s.set(`cache:task:${taskId}`, key, CACHE_TTL);
}
/** Forget a task's cache entry (it failed, or its session ended). */
export async function cacheForgetTask(taskId: string) {
  const s = getStore();
  const key = await s.get(`cache:task:${taskId}`);
  if (key) await s.del(`cache:${key}`);
  await s.del(`cache:task:${taskId}`);
}

// ---------- sessions (so /api/session/end knows what to forget) ----------
export const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
export async function trackSession(sessionId: string | undefined, taskId: string) {
  if (!sessionId || !SESSION_ID.test(sessionId)) return;
  const s = getStore();
  const k = `sess:${sessionId}`;
  let ids: string[] = [];
  try { ids = JSON.parse((await s.get(k)) ?? "[]"); } catch { /* start fresh */ }
  if (!ids.includes(taskId)) ids.push(taskId);
  await s.set(k, JSON.stringify(ids.slice(-50)), DAY_S);
}
export async function takeSession(sessionId: string): Promise<string[]> {
  const s = getStore();
  const k = `sess:${sessionId}`;
  let ids: string[] = [];
  try { ids = JSON.parse((await s.get(k)) ?? "[]"); } catch { /* none */ }
  await s.del(k);
  return ids;
}

/** Put task ids back on a session (running tasks that could not be deleted yet, so a second end can finish the job). */
export async function restoreSession(sessionId: string, taskIds: string[]) {
  if (!taskIds.length) return;
  await getStore().set(`sess:${sessionId}`, JSON.stringify(taskIds.slice(-50)), DAY_S);
}

// ---------- tasks whose session already ended (delete at YouCam as soon as their result has been read) ----------
const endedKey = (taskId: string) => `ended:${taskId}`;
export async function markEnded(taskId: string) { await getStore().set(endedKey(taskId), "1", 2 * DAY_S); }
export async function isEnded(taskId: string): Promise<boolean> { return (await getStore().get(endedKey(taskId))) !== null; }
export async function clearEnded(taskId: string) { await getStore().del(endedKey(taskId)); }
