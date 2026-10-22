// Browser-side try-on: POST /api/tryon to start, then poll GET /api/tryon/[id] until success or error.
// Never retries a create (it might have succeeded and cost units). Errors come back as a TryOnResult
// with plain words in `message`, so the card never shows a broken image.
import type { TryOnResult } from "@/lib/types";

export const POLL_MS = 1500;
/** Live renders take 9 to 30 s (docs/api-truth-table.md). After this we stop and say so. */
export const GIVE_UP_MS = 90_000;

const FALLBACK = "The try-on didn't work this time. Try again, or pick another photo.";

export interface TryOnOptions {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  pollMs?: number;
  giveUpMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onRunning?: (elapsedMs: number) => void;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

const failed = (id: string, errorCode: string, message?: string): TryOnResult => ({ id, status: "error", errorCode, message: message || FALLBACK });

/** face: a demo face id (e.g. "P1B") sent as JSON, or the user's own photo sent as multipart (live mode only). */
export async function runTryOn(itemId: string, face: string | Blob, opts: TryOnOptions = {}): Promise<TryOnResult> {
  const f = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  let res: Response;
  try {
    let init: RequestInit;
    if (typeof face === "string") {
      init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, faceId: face }) };
    } else {
      const form = new FormData();
      form.set("itemId", itemId);
      form.set("selfie", face, "selfie.jpg");
      init = { method: "POST", body: form };
    }
    res = await f("/api/tryon", { ...init, signal: opts.signal });
  } catch {
    return failed("", "network", "We couldn't reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) return failed("", body.errorCode ?? "create_failed", body.message);

  const id: string = body.id;
  const start = now();
  for (;;) {
    if (opts.signal?.aborted) return failed(id, "aborted", "Stopped.");
    let r: TryOnResult;
    try {
      const g = await f(`/api/tryon/${encodeURIComponent(id)}`, { signal: opts.signal, cache: "no-store" });
      r = await g.json();
    } catch {
      r = { id, status: "running" };
    }
    if (r.status === "success" && r.resultUrl) return r;
    if (r.status === "error") return { ...r, message: r.message || FALLBACK };
    const elapsed = now() - start;
    if (elapsed > (opts.giveUpMs ?? GIVE_UP_MS)) return failed(id, "timeout", "This is taking much longer than usual. Try this one again in a minute.");
    opts.onRunning?.(elapsed);
    await sleep(opts.pollMs ?? POLL_MS, opts.signal);
  }
}
