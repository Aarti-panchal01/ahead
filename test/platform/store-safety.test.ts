import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStore, upstashEnv } from "@/lib/store";
import {
  allowIp, cacheForgetTask, cacheGet, cacheKey, cachePut, claimDaily, getCall, recordCall, refundTask,
  takeSession, totalSpent, trackSession, usedToday, dayKey,
} from "@/lib/youcam/safety";

beforeEach(() => { setStore(new MemoryStore()); });
afterEach(() => { vi.unstubAllEnvs(); setStore(null); });

describe("store", () => {
  it("memory store: incr, ttl expiry, capped lists", async () => {
    let t = 1000;
    const s = new MemoryStore(() => t);
    expect(await s.incrBy("a", 2, 10)).toBe(2);
    expect(await s.incrBy("a", -1)).toBe(1);
    t += 11_000;
    expect(await s.get("a")).toBeNull();
    await s.push("l", "1", 2); await s.push("l", "2", 2); await s.push("l", "3", 2);
    expect(await s.range("l", 10)).toEqual(["3", "2"]);
  });
  it("reads both Upstash env naming schemes, and nothing when missing", () => {
    expect(upstashEnv({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(upstashEnv({ UPSTASH_REDIS_REST_URL: "u2", UPSTASH_REDIS_REST_TOKEN: "t2" })).toEqual({ url: "u2", token: "t2" });
    expect(upstashEnv({ KV_REST_API_URL: "u" })).toBeNull();
    expect(upstashEnv({})).toBeNull();
  });
});

describe("safety", () => {
  it("daily cap defaults to 20 units and never goes over", async () => {
    for (let i = 0; i < 10; i++) expect(await claimDaily(2)).toBe(true);
    expect(await claimDaily(2)).toBe(false);
    expect(await usedToday()).toBe(20);
  });
  it("daily cap follows the env", async () => {
    vi.stubEnv("AHEAD_DAILY_UNIT_CAP", "4");
    expect(await claimDaily(2)).toBe(true);
    expect(await claimDaily(2)).toBe(true);
    expect(await claimDaily(2)).toBe(false);
  });
  it("per-IP limit counts per hour and per IP", async () => {
    vi.stubEnv("AHEAD_IP_LIMIT_PER_HOUR", "3");
    const now = Date.UTC(2026, 9, 22, 10, 30);
    for (let i = 0; i < 3; i++) expect(await allowIp("1.2.3.4", now)).toBe(true);
    expect(await allowIp("1.2.3.4", now)).toBe(false);
    expect(await allowIp("5.6.7.8", now)).toBe(true);
    expect(await allowIp("1.2.3.4", now + 3_600_000)).toBe(true);
  });
  it("refunds a task once, in the ledger and the daily count", async () => {
    await claimDaily(2);
    await recordCall({ at: "x", feature: "hair-transfer", taskId: "t1", units: 2, day: dayKey(), kind: "tryon" });
    expect(await totalSpent()).toBe(2);
    expect(await refundTask("t1")).toBe(true);
    expect(await refundTask("t1")).toBe(false);
    expect(await totalSpent()).toBe(0);
    expect(await usedToday()).toBe(0);
    expect((await getCall("t1"))?.units).toBe(0);
  });
  it("cache maps a hash to a task and forgets it", async () => {
    const k = cacheKey(Buffer.from("a"), Buffer.from("b"), "{}");
    expect(k).not.toBe(cacheKey(Buffer.from("a"), Buffer.from("c"), "{}"));
    await cachePut(k, "t9");
    expect(await cacheGet(k)).toBe("t9");
    await cacheForgetTask("t9");
    expect(await cacheGet(k)).toBeNull();
  });
  it("tracks and clears a session", async () => {
    await trackSession("session-abc123", "t1");
    await trackSession("session-abc123", "t2");
    await trackSession("bad id!", "t3");
    expect(await takeSession("session-abc123")).toEqual(["t1", "t2"]);
    expect(await takeSession("session-abc123")).toEqual([]);
  });
});
