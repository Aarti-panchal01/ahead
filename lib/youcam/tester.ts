// Optional tester-code gate for live try-on on an uploaded selfie. Public demos are open by default;
// set AHEAD_REQUIRE_TESTER_CODE=true and TESTER_CODE to protect a private deployment.
// Codes are compared in constant time and are never logged or returned.
import { createHash, timingSafeEqual } from "node:crypto";
import { mode } from "./index";
import { fail } from "./http";
import type { Fields } from "./http";

const configured = () => process.env.TESTER_CODE || "";

/** True only when the deployment explicitly enables the gate and live mode has a configured code. */
export const testerRequired = (): boolean =>
  process.env.AHEAD_REQUIRE_TESTER_CODE === "true" && configured() !== "" && mode() === "live";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check (both sides hashed to equal length first). False when no code is configured to match. */
export function codeMatches(given: string | null | undefined): boolean {
  const want = configured();
  if (!want || !given) return false;
  return timingSafeEqual(digest(given), digest(want));
}

/** Returns a 403 Response when the gate applies and the code is missing or wrong, else null. */
export function testerGate(req: Request, body?: Pick<Fields, "get">): Response | null {
  if (!testerRequired()) return null;
  if (codeMatches(req.headers.get("x-ahead-tester") ?? body?.get("testerCode"))) return null;
  return fail("tester_code", 403);
}
