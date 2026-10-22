// Mock or live, as the server sees it. Platform owns the status route; until it exists we assume mock,
// which is the safe answer: mock never sends the user's photo anywhere.
import type { UnitStatus } from "@/lib/types";

export async function fetchMode(fetchFn: typeof fetch = fetch): Promise<UnitStatus> {
  try {
    const r = await fetchFn("/api/status", { cache: "no-store" });
    if (r.ok) {
      const s = (await r.json()) as UnitStatus;
      if (s.mode === "mock" || s.mode === "live") return s;
    }
  } catch {
    /* fall through */
  }
  return { mode: "mock", servingRecordings: true };
}
