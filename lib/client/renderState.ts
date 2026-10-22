// State of one card's render, kept per catalogue item on the results screen. Pure, so it is tested.
import type { IntegrityReport, TryOnResult } from "@/lib/types";

export type RenderState =
  | { phase: "idle"; attempts: number }
  | { phase: "running"; attempts: number; elapsedMs: number }
  | { phase: "checking"; attempts: number; result: TryOnResult }
  | { phase: "done"; attempts: number; result: TryOnResult; report: IntegrityReport }
  | { phase: "error"; attempts: number; result: TryOnResult };

export type RenderEvent =
  | { type: "start" }
  | { type: "tick"; elapsedMs: number }
  | { type: "result"; result: TryOnResult }
  | { type: "checked"; report: IntegrityReport };

export const IDLE: RenderState = { phase: "idle", attempts: 0 };

export function nextRender(s: RenderState, e: RenderEvent): RenderState {
  switch (e.type) {
    case "start":
      return { phase: "running", attempts: s.attempts + 1, elapsedMs: 0 };
    case "tick":
      return s.phase === "running" ? { ...s, elapsedMs: e.elapsedMs } : s;
    case "result":
      if (s.phase !== "running") return s;
      return e.result.status === "success"
        ? { phase: "checking", attempts: s.attempts, result: e.result }
        : { phase: "error", attempts: s.attempts, result: e.result };
    case "checked":
      return s.phase === "checking" ? { phase: "done", attempts: s.attempts, result: s.result, report: e.report } : s;
  }
}

/** Codes where trying again can't help (nothing to retry, or units are being saved). */
const FINAL = new Set(["no_recording", "unknown_item", "no_photo", "reserve", "error_no_face", "aborted"]);

/**
 * A create that returned an error may be retried once (CLAUDE.md, YouCam truth). A timeout
 * or a lost connection is not retried: that create might still succeed and cost units.
 */
export function canRetry(s: RenderState): boolean {
  if (s.phase !== "error") return false;
  const code = s.result.errorCode ?? "";
  return s.attempts < 2 && !FINAL.has(code) && code !== "timeout" && code !== "network";
}

/** Rough progress for the bar: live renders take 9 to 30 s. Never shows 100 % before the result. */
export function progressFraction(elapsedMs: number): number {
  return Math.min(0.92, elapsedMs / 30_000);
}

/** The image a card shows: the corrected render when the integrity check fixed something. */
export function shownImage(s: RenderState): string | undefined {
  if (s.phase === "done") return s.report.correctedImage ?? s.result.resultUrl;
  if (s.phase === "checking") return s.result.resultUrl;
  return undefined;
}
