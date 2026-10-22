// Live hair-transfer orchestration with every safety rail:
// cache -> IP rate limit -> real balance vs the judging reserve -> daily cap -> upload -> create (-> one retry after an explicit error).
// Units are claimed before the paid call and given back when YouCam answers with an error (errors cost 0).
import { YoucamError } from "./errors";
import { messageFor } from "./messages";
import { balance, createTask, FEATURES, getTask, upload, type TaskState } from "./client";
import {
  allowIp, cacheForgetTask, cacheGet, cacheKey, cachePut, claimDaily, dayKey, getCall, limits,
  recordCall, refundTask, releaseDaily, trackSession, type LedgerCall,
} from "./safety";

export type RefusalReason = "daily_cap" | "reserve" | "unavailable" | "rate_limit" | "error";
export type StartResult =
  | { ok: true; taskId: string; cached: boolean }
  | { ok: false; reason: RefusalReason; code: string; message: string; status: number };

/** Refusals where the honest fallback is a labelled recording (when one exists). */
export const servesRecording = (r: RefusalReason) => r === "daily_cap" || r === "reserve" || r === "unavailable";

const refuse = (reason: RefusalReason, code: string, status: number): StartResult => ({ ok: false, reason, code, message: messageFor(code), status });

export interface StartInput {
  src: Buffer;
  ref: Buffer;
  ip: string;
  sessionId?: string;
  kind?: LedgerCall["kind"];
}

export async function startHairTransfer({ src, ref, ip, sessionId, kind = "tryon" }: StartInput): Promise<StartResult> {
  const params = { hair_color: "ref" as const };
  const ck = cacheKey(src, ref, JSON.stringify(params));
  const hit = await cacheGet(ck);
  if (hit) { await trackSession(sessionId, hit); return { ok: true, taskId: hit, cached: true }; }

  if (!(await allowIp(ip))) return refuse("rate_limit", "rate_limit", 429);

  const units = FEATURES["hair-transfer"].units;
  // The real balance is read before every paid call: never go below the judging reserve.
  let bal: number;
  try { bal = await balance(); } catch (e) {
    if (e instanceof YoucamError && e.code === "missing_key") return refuse("error", "missing_key", 503);
    return refuse("unavailable", "unavailable", 503);
  }
  if (bal - units < limits().reserve) return refuse("reserve", "reserve", 503);
  if (!(await claimDaily(units))) return refuse("daily_cap", "daily_cap", 503);

  const day = dayKey();
  try {
    const payload = { src_file_id: await upload(src, "src.jpg"), ref_file_id: await upload(ref, "ref.jpg"), ...params };
    let out = await createTask("hair-transfer", payload);
    // One retry, only when YouCam explicitly answered with a transient error (so nothing was started).
    if (out.kind === "error" && out.retryable) out = await createTask("hair-transfer", payload);
    if (out.kind === "task") {
      await recordCall({ at: new Date().toISOString(), feature: "hair-transfer", taskId: out.taskId, units, day, kind, cacheKey: ck });
      await cachePut(ck, out.taskId);
      await trackSession(sessionId, out.taskId);
      return { ok: true, taskId: out.taskId, cached: false };
    }
    if (out.kind === "error") {
      await releaseDaily(units, day); // nothing started: nothing charged
      return refuse("error", out.code, 502);
    }
    // Unknown: the task may exist and may be charged. Keep the claim, never retry.
    return refuse("error", "create_failed", 502);
  } catch (e) {
    // Failed before a create was sent (upload): free.
    await releaseDaily(units, day);
    if (e instanceof YoucamError) return refuse("error", e.code, 502);
    return refuse("error", "upload_failed", 502);
  }
}

/** One status check. A task that ends in error is refunded in the ledger and forgotten by the cache. */
export async function pollTask(taskId: string): Promise<TaskState & { kind: LedgerCall["kind"] }> {
  const t = await getTask("hair-transfer", taskId);
  if (t.status === "error") {
    await refundTask(taskId);
    await cacheForgetTask(taskId);
  }
  const call = await getCall(taskId);
  return { ...t, kind: call?.kind ?? "tryon" };
}
