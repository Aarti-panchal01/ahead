import { describe, expect, it, vi } from "vitest";
import { runTryOn } from "@/lib/client/tryon";
import { IDLE, canRetry, nextRender, progressFraction, shownImage } from "@/lib/client/renderState";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noSleep = async () => {};

describe("runTryOn", () => {
  it("posts the item and face, then polls until success", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const answers = [json({ id: "mock:rec__P1B__W01" }), json({ id: "mock:rec__P1B__W01", status: "running" }), json({ id: "mock:rec__P1B__W01", status: "success", resultUrl: "/api/fixtures/rec__P1B__W01" })];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init]); return answers.shift()!; }) as unknown as typeof fetch;
    const ticks: number[] = [];
    const r = await runTryOn("W01", "P1B", { fetchFn, sleep: noSleep, onRunning: (ms) => ticks.push(ms) });
    expect(r).toMatchObject({ status: "success", resultUrl: "/api/fixtures/rec__P1B__W01" });
    expect(calls[0][0]).toBe("/api/tryon");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ itemId: "W01", faceId: "P1B" });
    expect(calls[1][0]).toBe("/api/tryon/mock%3Arec__P1B__W01");
    expect(ticks).toHaveLength(1);
  });

  it("passes the server's plain message through when there is no recording", async () => {
    const fetchFn = vi.fn(async () => json({ errorCode: "no_recording", message: "This demo combination isn't recorded yet. Pick another wig or face." }, 422)) as unknown as typeof fetch;
    const r = await runTryOn("W05", "P1B", { fetchFn, sleep: noSleep });
    expect(r).toMatchObject({ status: "error", errorCode: "no_recording" });
    expect(r.message).toMatch(/isn't recorded yet/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns a YouCam error from polling with a message", async () => {
    const answers = [json({ id: "t1" }), json({ id: "t1", status: "error", errorCode: "error_no_shoulder", message: "We need to see your shoulders." })];
    const fetchFn = vi.fn(async () => answers.shift()!) as unknown as typeof fetch;
    const r = await runTryOn("W01", "P1B", { fetchFn, sleep: noSleep });
    expect(r).toMatchObject({ status: "error", errorCode: "error_no_shoulder", message: "We need to see your shoulders." });
  });

  it("never creates twice: gives up polling after the time limit", async () => {
    let t = 0;
    const fetchFn = vi.fn(async (url: string) => (url === "/api/tryon" ? json({ id: "t2" }) : json({ id: "t2", status: "running" }))) as unknown as typeof fetch;
    const r = await runTryOn("W01", "P1B", { fetchFn, sleep: noSleep, now: () => (t += 10_000), giveUpMs: 30_000 });
    expect(r.errorCode).toBe("timeout");
    expect(vi.mocked(fetchFn).mock.calls.filter(([u]) => u === "/api/tryon")).toHaveLength(1);
  });

  it("says what to do when the network fails", async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    const r = await runTryOn("W01", "P1B", { fetchFn, sleep: noSleep });
    expect(r).toMatchObject({ status: "error", errorCode: "network" });
    expect(r.message).toMatch(/connection/);
  });

  it("sends a real photo as multipart", async () => {
    let body: unknown;
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => { body = init?.body; return json({ errorCode: "no_recording", message: "x" }, 422); }) as unknown as typeof fetch;
    await runTryOn("W01", new Blob(["jpg"], { type: "image/jpeg" }), { fetchFn, sleep: noSleep });
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("itemId")).toBe("W01");
    expect((body as FormData).get("selfie")).toBeInstanceOf(Blob);
  });
});

describe("render state", () => {
  const ok = { id: "t", status: "success" as const, resultUrl: "/r.jpg" };
  const report = { status: "unchanged" as const, regions: [], plainText: "Skin tone check: unchanged" };

  it("goes idle -> running -> checking -> done", () => {
    let s = nextRender(IDLE, { type: "start" });
    expect(s).toMatchObject({ phase: "running", attempts: 1 });
    s = nextRender(s, { type: "tick", elapsedMs: 4000 });
    expect(s).toMatchObject({ elapsedMs: 4000 });
    s = nextRender(s, { type: "result", result: ok });
    expect(s.phase).toBe("checking");
    expect(shownImage(s)).toBe("/r.jpg");
    s = nextRender(s, { type: "checked", report });
    expect(s.phase).toBe("done");
  });

  it("shows the corrected image when the check fixed the render", () => {
    let s = nextRender(nextRender(IDLE, { type: "start" }), { type: "result", result: ok });
    s = nextRender(s, { type: "checked", report: { ...report, status: "corrected", correctedImage: "data:fixed" } });
    expect(shownImage(s)).toBe("data:fixed");
  });

  it("allows one retry after a real error, none for no_recording or a timeout", () => {
    const err = (code: string) => nextRender(nextRender(IDLE, { type: "start" }), { type: "result", result: { id: "", status: "error", errorCode: code } });
    expect(canRetry(err("unknown_internal_error"))).toBe(true);
    expect(canRetry(err("no_recording"))).toBe(false);
    expect(canRetry(err("timeout"))).toBe(false);
    expect(canRetry(err("network"))).toBe(false);
    const second = nextRender(nextRender(err("unknown_internal_error"), { type: "start" }), { type: "result", result: { id: "", status: "error", errorCode: "unknown_internal_error" } });
    expect(canRetry(second)).toBe(false);
  });

  it("never shows a full bar before the result", () => {
    expect(progressFraction(0)).toBe(0);
    expect(progressFraction(15_000)).toBeCloseTo(0.5);
    expect(progressFraction(120_000)).toBeLessThan(1);
  });
});
