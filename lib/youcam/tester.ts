// Tester code gate for live try-on on an uploaded selfie. When env TESTER_CODE is set, such a request needs the code
// in header x-ahead-tester (or form/JSON field testerCode). Compared in constant time. The code is never logged
// or returned. Demo faces and recordings never need it. Unset TESTER_CODE: no gate.
import { createHash, timingSafeEqual } from "node:crypto";
import { mode } from "./index";
import { fail } from "./http";
import type { Fields } from "./http";

const configured = () => process.env.TESTER_CODE || "";

/** True when a code is required: TESTER_CODE is set and the app is live. */
export const testerRequired = (): boolean => configured() !== "" && mode() === "live";

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
