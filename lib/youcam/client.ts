// Live YouCam REST client, ported from reference/killtest/youcam_client.py.
// Server only: the key comes from YOUCAM_API_KEY and is never returned or logged.
// Rules (docs/api-truth-table.md): upload via /s2s/v2.0/file, then create, then the browser polls.
// A create is never retried here (tryon.ts allows one retry, and only after an explicit error).
// Errors can arrive inside HTTP 200 with task_status "error" (0 units).
import { YoucamError } from "./errors";
import { messageFor } from "./messages";
import { prepareUpload } from "./images";

export { YoucamError };
export { RESERVE_UNITS } from "./safety";

export const BASE = "https://yce-api-01.makeupar.com";

export const FEATURES = {
  "hair-transfer": { version: "v2.1", units: 2 },
} as const;
export type Feature = keyof typeof FEATURES;

function key(): string {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new YoucamError("missing_key", messageFor("missing_key"));
  return k;
}
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });

/** JPG, long side at most 1024 (hair-transfer limit), metadata stripped. */
export const prepare = prepareUpload;

/** Real unit balance from YouCam (free call). Throws if it can't be read. */
export async function balance(): Promise<number> {
  const r = await fetch(`${BASE}/s2s/v1.0/client/credit`, { headers: headers() });
  if (!r.ok) throw new YoucamError("unavailable", messageFor("unavailable"));
  const j = (await r.json().catch(() => null)) as { results?: { amount_dec?: number; amount?: number }[] } | null;
  if (!j || !Array.isArray(j.results)) throw new YoucamError("unavailable", messageFor("unavailable"));
  return j.results.reduce((s, x) => s + Number(x.amount_dec ?? x.amount ?? 0), 0);
}

export async function upload(bytes: Buffer, name: string): Promise<string> {
  const fail = () => new YoucamError("upload_failed", messageFor("upload_failed"));
  const r = await fetch(`${BASE}/s2s/v2.0/file`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ files: [{ content_type: "image/jpg", file_name: name, file_size: bytes.length }] }),
  });
  const j = await r.json().catch(() => null);
  const f = j?.data?.files?.[0];
  if (!f?.file_id) throw fail();
  const req = f.requests[0];
  const put = await fetch(req.url, { method: "PUT", headers: req.headers ?? { "Content-Type": "image/jpg" }, body: new Uint8Array(bytes) });
  if (!put.ok) throw fail();
  return f.file_id as string;
}

export type CreateOutcome =
  | { kind: "task"; taskId: string }
  /** YouCam answered with an explicit error and no task: nothing was started, nothing charged. */
  | { kind: "error"; code: string; retryable: boolean }
  /** No usable answer (network drop, unreadable body). The task may exist: never retry, keep the charge. */
  | { kind: "unknown" };

/** One create call. Never retries. */
export async function createTask(feature: Feature, payload: Record<string, unknown>): Promise<CreateOutcome> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/s2s/${FEATURES[feature].version}/task/${feature}`, { method: "POST", headers: headers(), body: JSON.stringify(payload) });
  } catch {
    return { kind: "unknown" };
  }
  const j = await r.json().catch(() => null);
  if (!j || typeof j !== "object") return { kind: "unknown" };
  const taskId = j?.data?.task_id as string | undefined;
  if (taskId) return { kind: "task", taskId };
  const code = String(j.error_code ?? j.error ?? "create_failed");
  return { kind: "error", code, retryable: r.status >= 500 || code === "unknown_internal_error" };
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
  if (d.task_status === "error") return { status: "error", errorCode: d.error ?? "unknown_error" };
  return { status: "running" };
}
