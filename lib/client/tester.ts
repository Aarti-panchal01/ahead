// Tester codes for live own-photo try-ons in Production. Contract (platform):
//   GET /api/status        -> UnitStatus plus testerRequired: boolean
//   POST /api/tester {code} -> 200 {ok: true}, or 403 when the code is wrong
//   POST /api/tryon with a selfie needs header x-ahead-tester: <code>; otherwise 403 errorCode "tester_code".
// The code is kept in sessionStorage for this visit only (cleared when the tab closes). Sample people never need it.
import type { UnitStatus } from "@/lib/types";

export const TESTER_HEADER = "x-ahead-tester";
const KEY = "ahead-tester-code";

export const TESTER_PROMPT = "Have a tester code? Enter it to see wigs on your own photo";
export const TESTER_WRONG = "That code didn't work. Check it and try again.";

/** Status as platform sends it; testerRequired is read defensively until it is in lib/types.ts. */
export type StatusWithTester = UnitStatus & { testerRequired?: boolean };

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

function store(): Store | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined; // blocked storage: the code then lasts until the page reloads (kept in memory below)
  }
}

let memory: string | undefined;

export function storedCode(s: Store | undefined = store()): string | undefined {
  try {
    return s?.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function forgetCode(s: Store | undefined = store()): void {
  memory = undefined;
  try { s?.removeItem(KEY); } catch { /* nothing to clear */ }
}

function keep(code: string, s: Store | undefined): void {
  memory = code;
  try { s?.setItem(KEY, code); } catch { /* memory copy is enough */ }
}

/** True when live own-photo try-ons are on but this visit has no tester code yet. */
export function needsTesterCode(status: StatusWithTester, s: Store | undefined = store()): boolean {
  return Boolean(status.testerRequired) && !storedCode(s);
}

/** The header for own-photo try-ons, when a code is stored. */
export function testerHeaders(s: Store | undefined = store()): Record<string, string> {
  const c = storedCode(s);
  return c ? { [TESTER_HEADER]: c } : {};
}

export type SubmitResult = { ok: true } | { ok: false; message: string };

export async function submitTesterCode(code: string, fetchFn: typeof fetch = fetch, s: Store | undefined = store()): Promise<SubmitResult> {
  const c = code.trim();
  if (!c) return { ok: false, message: TESTER_WRONG };
  try {
    const r = await fetchFn("/api/tester", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
    if (r.ok && j.ok) {
      keep(c, s);
      return { ok: true };
    }
    if (r.status === 403 || r.ok) return { ok: false, message: TESTER_WRONG };
    return { ok: false, message: "We couldn't check the code just now. Try again in a moment." };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}
