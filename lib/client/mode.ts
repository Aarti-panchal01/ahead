// Mock or live, as the server sees it (GET /api/status). Until it answers we assume mock, which is the safe
// answer: mock never sends the user's photo anywhere.
import type { UnitStatus } from "@/lib/types";

export const SAFE_STATUS: UnitStatus = { mode: "mock", servingRecordings: true };

export async function fetchMode(fetchFn: typeof fetch = fetch): Promise<UnitStatus> {
  try {
    const r = await fetchFn("/api/status", { cache: "no-store" });
    if (r.ok) {
      const s = (await r.json()) as UnitStatus;
      if (s.mode === "mock" || s.mode === "live") return { ...s, servingRecordings: Boolean(s.servingRecordings) };
    }
  } catch {
    /* fall through */
  }
  return SAFE_STATUS;
}

/** The user's own photo gets real try-ons only in live mode with units to spend. */
export function ownPhotoCanRender(s: UnitStatus): boolean {
  return s.mode === "live" && !s.servingRecordings;
}

/**
 * Why own-photo previews use sample people right now, in plain words. Undefined when live try-ons are on
 * (then the demo line must not appear at all).
 */
export function demoNote(s: UnitStatus): string | undefined {
  if (ownPhotoCanRender(s)) return undefined;
  const lead = "In this demo, previews use our sample people.";
  const tail = "Your own photo stays on this device and sets your colour and your matches.";
  const why =
    s.mode === "mock" ? "Live try-ons are switched off in this version."
    : s.reason === "daily_cap" ? "Today's live try-ons are used up; they come back tomorrow."
    : s.reason === "reserve" ? "We are keeping our last try-ons in reserve for judging."
    : "Live try-ons aren't available right now.";
  return `${lead} ${why} ${tail}`;
}
