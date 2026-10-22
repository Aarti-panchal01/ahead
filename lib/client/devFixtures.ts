// DEV-ONLY, TEMPORARY. Until platform's /api/tryon accepts persona faces (P1B..P4B), the screenshots
// need a way to show the committed recordings. When NEXT_PUBLIC_AHEAD_DEV_FIXTURES=1 and this is not a
// production build, runTryOn skips the API and serves the recording straight from /api/fixtures/<name>.
// Delete this file (and its one call in tryon.ts) once platform merges persona support.
import type { TryOnResult } from "@/lib/types";

const KNOWN = [
  "rec__P1B__W01", "rec__P1B__W02", "rec__P1B__W03",
  "rec__P2B__W04", "rec__P2B__W05", "rec__P2B__W06",
  "rec__P3B__W07", "rec__P3B__W08", "rec__P3B__W09",
  "rec__P4B__W10", "rec__P4B__W11", "rec__P4B__W12",
  "hero__P1B__H01", "hero__P2B__H02", "hero__P2B__H04",
];

export function devFixturesOn(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AHEAD_DEV_FIXTURES === "1";
}

export function devFixture(faceId: string, itemId: string): TryOnResult {
  const name = KNOWN.find((n) => n.endsWith(`__${faceId}__${itemId}`));
  const id = `dev:${faceId}:${itemId}`;
  return name
    ? { id, status: "success", resultUrl: `/api/fixtures/${name}`, unitsCharged: 0 }
    : { id, status: "error", errorCode: "no_recording", message: "This demo combination isn't recorded yet. Pick another wig or face." };
}
