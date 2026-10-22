// GET /api/status payload: the live-mode budget as the UI needs it.
import type { UnitStatus } from "@/lib/types";
import { getStore } from "@/lib/store";
import { mode } from "./index";
import { balance, FEATURES } from "./client";
import { limits, usedToday } from "./safety";

/** UnitStatus plus the reason the demo is serving recordings (extra field, request to add to lib/types.ts). */
export interface UnitStatusDetail extends UnitStatus {
  reason?: "daily_cap" | "reserve" | "unavailable";
}

async function cachedBalance(): Promise<number | null> {
  const s = getStore();
  const hit = await s.get("balance:cache");
  if (hit !== null) return Number(hit);
  try {
    const b = await balance();
    await s.set("balance:cache", String(b), 60);
    return b;
  } catch { return null; }
}

export async function getUnitStatus(): Promise<UnitStatusDetail> {
  if (mode() === "mock") return { mode: "mock", servingRecordings: false };
  const { dailyCap, reserve } = limits();
  const units = FEATURES["hair-transfer"].units;
  const remainingToday = Math.max(0, dailyCap - (await usedToday()));
  if (remainingToday < units) return { mode: "live", servingRecordings: true, remainingToday, reason: "daily_cap" };
  const bal = await cachedBalance();
  if (bal === null) return { mode: "live", servingRecordings: true, remainingToday, reason: "unavailable" };
  if (bal - units < reserve) return { mode: "live", servingRecordings: true, remainingToday, reason: "reserve" };
  return { mode: "live", servingRecordings: false, remainingToday };
}
