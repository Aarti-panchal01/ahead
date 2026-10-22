// POST /api/agent/approve: runs ONE try-on the user approved from the plan's pendingApproval list.
// Same body as POST /api/tryon (JSON { itemId, faceId } or multipart { itemId, selfie }) plus header x-ahead-session.
// Goes through the existing try-on route (REST: ledger, cache, reserve, daily cap, recordings) and counts
// against the 30-unit session cap. Response: the try-on job (poll GET /api/tryon/[id]) + unitsCharged,
// unitsUsed and the remaining pendingApproval.
import { approveTryOn } from "@/lib/agent/tryon";
import { POST as tryOn } from "@/app/api/tryon/route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return approveTryOn(req, tryOn);
}
