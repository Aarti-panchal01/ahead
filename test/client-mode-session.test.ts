import { describe, expect, it, vi } from "vitest";
import { demoNote, fetchMode, ownPhotoCanRender } from "@/lib/client/mode";
import { SESSION_ID, endSession, getSessionId, resetSessionId, sessionHeaders } from "@/lib/client/session";
import { renderSrc } from "@/lib/client/tryon";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("mode", () => {
  it("own photos render only in live mode with units", () => {
    expect(ownPhotoCanRender({ mode: "live", servingRecordings: false })).toBe(true);
    expect(ownPhotoCanRender({ mode: "live", servingRecordings: true, reason: "daily_cap" })).toBe(false);
    expect(ownPhotoCanRender({ mode: "mock", servingRecordings: false })).toBe(false);
  });

  it("the demo line appears only when own photos can't render, with the reason", () => {
    expect(demoNote({ mode: "live", servingRecordings: false })).toBeUndefined();
    expect(demoNote({ mode: "mock", servingRecordings: true })).toMatch(/^In this demo, previews use our sample people\. Live try-ons are switched off/);
    expect(demoNote({ mode: "live", servingRecordings: true, reason: "daily_cap" })).toMatch(/Today's live try-ons are used up/);
    expect(demoNote({ mode: "live", servingRecordings: true, reason: "reserve" })).toMatch(/reserve for judging/);
  });

  it("falls back to mock when the status route is missing", async () => {
    const f = vi.fn(async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchMode(f)).toEqual({ mode: "mock", servingRecordings: true });
    const g = vi.fn(async () => json({ mode: "live", servingRecordings: false, remainingToday: 40 })) as unknown as typeof fetch;
    expect(await fetchMode(g)).toMatchObject({ mode: "live", servingRecordings: false });
  });
});

describe("session", () => {
  it("one id per visit, in the server's format", () => {
    resetSessionId();
    const a = getSessionId();
    expect(a).toMatch(SESSION_ID);
    expect(getSessionId()).toBe(a);
    expect(sessionHeaders()).toEqual({ "x-ahead-session": a });
    resetSessionId();
    expect(getSessionId()).not.toBe(a);
  });

  it("ends the session with the header and keepalive; nothing to end before any try-on", async () => {
    resetSessionId();
    const f = vi.fn(async () => json({ ended: true })) as unknown as typeof fetch;
    expect(await endSession(f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
    const id = getSessionId();
    expect(await endSession(f)).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/session/end", expect.objectContaining({ method: "POST", keepalive: true, headers: { "x-ahead-session": id } }));
  });

  it("never throws when the network is gone", async () => {
    getSessionId();
    const f = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await endSession(f)).toBe(false);
  });
});

describe("renderSrc", () => {
  it("recordings load from our fixtures route", () => {
    expect(renderSrc({ id: "mock:rec__P1B__W01", status: "success", resultUrl: "/api/fixtures/rec__P1B__W01" })).toBe("/api/fixtures/rec__P1B__W01");
  });
  it("live renders load through the same-origin proxy, never the YouCam URL", () => {
    const src = renderSrc({ id: "task-123", status: "success", resultUrl: "https://yce.example/result.jpg" });
    expect(src).toBe("/api/result?id=task-123");
  });
  it("nothing for errors", () => expect(renderSrc({ id: "t", status: "error" })).toBeUndefined());
});
