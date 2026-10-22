// Mock mode: replays the kill-test recordings in fixtures/youcam at 0 units. Default in development.
// A recording is "<phase>__<face>__<item>.json" (+ ".jpg" on success). Demo faces are F1..F7.
import fs from "node:fs";
import path from "node:path";

export const FIXTURES = path.join(process.cwd(), "fixtures", "youcam");
const SAFE = /^[A-Za-z0-9_]+$/;

export function findRecording(faceId: string, itemId: string): string | null {
  if (!SAFE.test(faceId) || !SAFE.test(itemId)) return null;
  const names = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(`__${faceId}__${itemId}.json`)).sort();
  return names.length ? names[0].replace(/\.json$/, "") : null;
}

export function mockTaskId(recording: string): string {
  return `mock:${recording}`;
}

export interface MockState { status: "success" | "error"; resultUrl?: string; errorCode?: string; latencyS?: number }

export function readMock(taskId: string): MockState | null {
  const name = taskId.startsWith("mock:") ? taskId.slice(5) : "";
  if (!SAFE.test(name)) return null;
  const p = path.join(FIXTURES, `${name}.json`);
  if (!fs.existsSync(p)) return null;
  const r = JSON.parse(fs.readFileSync(p, "utf8"));
  if (r.status === "success" && r.result) return { status: "success", resultUrl: `/api/fixtures/${name}`, latencyS: r.latency_s };
  return { status: "error", errorCode: r.error_code ?? "unknown_error", latencyS: r.latency_s };
}
