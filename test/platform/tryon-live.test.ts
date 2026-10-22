import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStore } from "@/lib/store";
import { pollTask, startHairTransfer } from "@/lib/youcam/tryon";
import { totalSpent, usedToday } from "@/lib/youcam/safety";
import { fakeYoucam, freshStore, jpeg, type FakeYoucam } from "./helpers";

let fy: FakeYoucam;
beforeEach(() => {
  freshStore();
  vi.stubEnv("YOUCAM_API_KEY", "secret-key-123");
  fy = fakeYoucam(300);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); setStore(null); });

const start = async (ip = "9.9.9.9") => startHairTransfer({ src: await jpeg(), ref: await jpeg(), ip });

describe("live hair-transfer safety", () => {
  it("runs a paid call and records it", async () => {
    const r = await start();
    expect(r).toMatchObject({ ok: true, cached: false });
    expect(fy.creates()).toBe(1);
    expect(await totalSpent()).toBe(2);
    expect(await usedToday()).toBe(2);
  });

  it("serves a repeat from the cache with no YouCam call at all", async () => {
    const src = await jpeg(), ref = await jpeg();
    const a = await startHairTransfer({ src, ref, ip: "1.1.1.1" });
    const before = fy.calls.length;
    const b = await startHairTransfer({ src, ref, ip: "1.1.1.1" });
    expect(b).toMatchObject({ ok: true, cached: true });
    expect(b.ok && a.ok && b.taskId === a.taskId).toBe(true);
    expect(fy.calls.length).toBe(before);
  });

  it("stops at the daily cap (default 20 units = 10 calls)", async () => {
    for (let i = 0; i < 10; i++) expect((await start(`10.0.0.${i}`)).ok).toBe(true);
    const r = await start("10.0.1.1");
    expect(r).toMatchObject({ ok: false, reason: "daily_cap" });
    expect(fy.creates()).toBe(10);
  });

  it("never goes below the 150-unit reserve and creates nothing", async () => {
    fy.setBalance(151); // 151 - 2 = 149 < 150
    const r = await start();
    expect(r).toMatchObject({ ok: false, reason: "reserve" });
    expect(fy.creates()).toBe(0);
    expect(fy.calls.some((c) => c.url.includes("/s2s/v2.0/file"))).toBe(false);
    fy.setBalance(152); // exactly the reserve afterwards: allowed
    expect((await start()).ok).toBe(true);
  });

  it("reads the real balance before every paid call", async () => {
    await start(); await start();
    expect(fy.calls.filter((c) => c.url.endsWith("/client/credit")).length).toBe(2);
  });

  it("refuses safely when the balance can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await start()).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("rate limits per IP", async () => {
    vi.stubEnv("AHEAD_IP_LIMIT_PER_HOUR", "2");
    expect((await start("7.7.7.7")).ok).toBe(true);
    expect((await start("7.7.7.7")).ok).toBe(true);
    expect(await start("7.7.7.7")).toMatchObject({ ok: false, reason: "rate_limit", status: 429 });
    expect((await start("8.8.8.8")).ok).toBe(true);
  });

  it("refunds when the task ends in error (HTTP 200, task_status error) and forgets the cache entry", async () => {
    const src = await jpeg(), ref = await jpeg();
    const r = await startHairTransfer({ src, ref, ip: "2.2.2.2" });
    if (!r.ok) throw new Error("expected ok");
    expect(await usedToday()).toBe(2);
    fy.taskStatus[r.taskId] = { task_status: "error", error: "error_no_face", results: null };
    const t = await pollTask(r.taskId);
    expect(t).toMatchObject({ status: "error", errorCode: "error_no_face" });
    await pollTask(r.taskId); // polling again must not refund twice
    expect(await totalSpent()).toBe(0);
    expect(await usedToday()).toBe(0);
    const again = await startHairTransfer({ src, ref, ip: "2.2.2.2" });
    expect(again).toMatchObject({ ok: true, cached: false });
  });

  it("gives units back when create answers with an explicit error, and does not retry a client error", async () => {
    fy.createAnswers.push(() => new Response(JSON.stringify({ error_code: "invalid_parameter" }), { status: 400 }));
    const r = await start();
    expect(r).toMatchObject({ ok: false, code: "invalid_parameter" });
    expect(fy.creates()).toBe(1);
    expect(await usedToday()).toBe(0);
  });

  it("retries a create once after an explicit transient error", async () => {
    fy.createAnswers.push(() => new Response(JSON.stringify({ error_code: "unknown_internal_error" }), { status: 200 }));
    const r = await start();
    expect(r.ok).toBe(true);
    expect(fy.creates()).toBe(2);
  });

  it("retries at most once", async () => {
    const boom = () => new Response(JSON.stringify({ error_code: "unknown_internal_error" }), { status: 500 });
    fy.createAnswers.push(boom, boom);
    const r = await start();
    expect(r.ok).toBe(false);
    expect(fy.creates()).toBe(2);
    expect(await usedToday()).toBe(0);
  });

  it("never retries a create that may have succeeded (network drop) and keeps the charge", async () => {
    fy.createAnswers.push(() => { throw new Error("socket hang up"); });
    const r = await start();
    expect(r).toMatchObject({ ok: false, code: "create_failed" });
    expect(fy.creates()).toBe(1);
    expect(await usedToday()).toBe(2);
  });

  it("never puts the key in a result", async () => {
    const out = JSON.stringify([await start(), await start()]);
    expect(out).not.toContain("secret-key-123");
  });
});
