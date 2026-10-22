// Agent guardrails kept in the shared Store (Upstash in production, memory in tests), under "agent:" keys:
// a 30-unit cap per session (x-ahead-session) and the list of paid steps waiting for the user's OK.
import { getStore } from "@/lib/store";

export const SESSION_CAP_UNITS = 30;
const TTL_S = 86_400;
const unitsKey = (sid: string) => `agent:units:${sid}`;
const pendingKey = (sid: string) => `agent:pending:${sid}`;

export interface PendingStep {
  tool: "try_on";
  itemId: string;
  units: number;
}

export async function unitsUsed(sid: string): Promise<number> {
  return Number((await getStore().get(unitsKey(sid))) ?? 0);
}

/** Atomically claims units against the session cap. False (and nothing claimed) if it would go over. */
export async function claimUnits(sid: string, units: number): Promise<boolean> {
  const s = getStore();
  const total = await s.incrBy(unitsKey(sid), units, TTL_S);
  if (total > SESSION_CAP_UNITS) { await s.incrBy(unitsKey(sid), -units, TTL_S); return false; }
  return true;
}

export async function releaseUnits(sid: string, units: number): Promise<void> {
  await getStore().incrBy(unitsKey(sid), -units, TTL_S);
}

export async function getPending(sid: string): Promise<PendingStep[]> {
  try { return JSON.parse((await getStore().get(pendingKey(sid))) ?? "[]") as PendingStep[]; } catch { return []; }
}

export async function setPending(sid: string, steps: PendingStep[]): Promise<void> {
  await getStore().set(pendingKey(sid), JSON.stringify(steps), TTL_S);
}

/** Removes and returns the pending step for this item, or null if the agent never proposed it. */
export async function takePending(sid: string, itemId: string): Promise<PendingStep | null> {
  const all = await getPending(sid);
  const i = all.findIndex((p) => p.itemId === itemId);
  if (i < 0) return null;
  const [step] = all.splice(i, 1);
  await setPending(sid, all);
  return step;
}

/** Puts a step back (the approved run failed before anything was charged). */
export async function restorePending(sid: string, step: PendingStep): Promise<void> {
  const all = await getPending(sid);
  if (!all.some((p) => p.itemId === step.itemId)) await setPending(sid, [...all, step]);
}
