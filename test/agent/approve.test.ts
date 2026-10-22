import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as tryOnRoute } from "@/app/api/tryon/route";
import { claimUnits, getPending, SESSION_CAP_UNITS, setPending, unitsUsed } from "@/lib/agent/budget";
import { approveTryOn, MAX_PROPOSED, proposeTryOns, TRYON_UNITS, type TryOnHandler } from "@/lib/agent/tryon";
import { setStore } from "@/lib/store";
import { fakeYoucam, freshStore, setEnv } from "../platform/helpers";

const SID = "sess_approve_01";
const req = (body: unknown, sid: string | null = SID) =>
  new Request("http://localhost/api/agent/approve", {
    method: "POST",
    headers: { "content-type": "application/json", ...(sid ? { "x-ahead-session": sid } : {}) },
    body: JSON.stringify(body),
  });
const ok = (o: Record<string, unknown>, status = 200): TryOnHandler => async () => Response.json(o, { status });

beforeEach(() => { freshStore(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); setStore(null); });

describe("try_on proposals", () => {
  it("proposes at most 3 usable items, 2 units each", () => {
    const p = proposeTryOns(["W01", "W02", "W03", "W04"], 0);
    expect(p).toHaveLength(MAX_PROPOSED);
    expect(p.every((x) => x.tool === "try_on" && x.units === TRYON_UNITS)).toBe(true);
    expect(proposeTryOns(["nope", "W01", "W01"], 0).map((x) => x.itemId)).toEqual(["W01"]);
  });

  it("only proposes what still fits under the 30-unit cap", () => {
    expect(proposeTryOns(["W01", "W02", "W03"], SESSION_CAP_UNITS - TRYON_UNITS)).toHaveLength(1);
    expect(proposeTryOns(["W01", "W02", "W03"], SESSION_CAP_UNITS - 1)).toHaveLength(0);
  });
});

describe("session cap", () => {
  it("claims atomically and refuses past 30", async () => {
    for (let i = 0; i < SESSION_CAP_UNITS / TRYON_UNITS; i++) expect(await claimUnits(SID, TRYON_UNITS)).toBe(true);
    expect(await claimUnits(SID, TRYON_UNITS)).toBe(false);
    expect(await unitsUsed(SID)).toBe(SESSION_CAP_UNITS);
    expect(await unitsUsed("other_session_1")).toBe(0);
  });
});

describe("POST /api/agent/approve", () => {
  it("needs a session and an item the plan proposed", async () => {
    const run = vi.fn<TryOnHandler>(ok({}));
    expect((await approveTryOn(req({ itemId: "W01" }, null), run)).status).toBe(400);
    expect((await approveTryOn(req({}), run)).status).toBe(400);
    const r = await approveTryOn(req({ itemId: "W01", faceId: "P1A" }), run);
    expect(r.status).toBe(403);
    expect((await r.json()).errorCode).toBe("not_proposed");
    expect(run).not.toHaveBeenCalled();
  });

  it("a live render is charged against the cap and leaves the approval list", async () => {
    await setPending(SID, proposeTryOns(["W01", "W02"], 0));
    const run = vi.fn<TryOnHandler>(ok({ id: "task1", itemId: "W01", mode: "live" }));
    const r = await approveTryOn(req({ itemId: "W01", faceId: "P1A" }), run);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ id: "task1", unitsCharged: TRYON_UNITS, unitsUsed: TRYON_UNITS });
    expect(j.pendingApproval.map((p: { itemId: string }) => p.itemId)).toEqual(["W02"]);
    // Forwarded to the try-on route with the same body and session header.
    const fwd = run.mock.calls[0][0] as Request;
    expect(new URL(fwd.url).pathname).toBe("/api/tryon");
    expect(fwd.headers.get("x-ahead-session")).toBe(SID);
    expect(await fwd.json()).toEqual({ itemId: "W01", faceId: "P1A" });
    // Approving the same item twice does nothing.
    expect((await approveTryOn(req({ itemId: "W01", faceId: "P1A" }), run)).status).toBe(403);
  });

  it("recordings and errors cost nothing; an error puts the step back", async () => {
    await setPending(SID, proposeTryOns(["W01", "W02"], 0));
    const rec = await approveTryOn(req({ itemId: "W01", faceId: "P1A" }), ok({ id: "mock:x", mode: "mock", recording: true }));
    expect((await rec.json()).unitsCharged).toBe(0);
    const err = await approveTryOn(req({ itemId: "W02", faceId: "P1A" }), ok({ errorCode: "error_no_face", message: "m" }, 502));
    expect(err.status).toBe(502);
    expect(await unitsUsed(SID)).toBe(0);
    expect((await getPending(SID)).map((p) => p.itemId)).toEqual(["W02"]);
  });

  it("reads the item id from a multipart selfie upload and forwards the same body", async () => {
    await setPending(SID, proposeTryOns(["W02"], 0));
    const form = new FormData();
    form.set("itemId", "W02");
    form.set("selfie", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "me.jpg");
    const run = vi.fn<TryOnHandler>(ok({ id: "task9", mode: "live" }));
    const r = await approveTryOn(new Request("http://localhost/api/agent/approve", { method: "POST", headers: { "x-ahead-session": SID }, body: form }), run);
    expect(r.status).toBe(200);
    const fwd = await (run.mock.calls[0][0] as Request).formData();
    expect(fwd.get("itemId")).toBe("W02");
    expect(fwd.get("selfie")).toBeInstanceOf(Blob);
  });

  it("refuses at the cap without calling the try-on path", async () => {
    await setPending(SID, proposeTryOns(["W01"], 0));
    await claimUnits(SID, SESSION_CAP_UNITS);
    const run = vi.fn<TryOnHandler>(ok({}));
    const r = await approveTryOn(req({ itemId: "W01", faceId: "P1A" }), run);
    expect(r.status).toBe(429);
    expect((await r.json()).errorCode).toBe("session_cap");
    expect(run).not.toHaveBeenCalled();
    expect((await getPending(SID)).map((p) => p.itemId)).toEqual(["W01"]);
  });

  it("through the real try-on route in mock mode: a labelled recording, 0 units", async () => {
    setEnv({ YOUCAM_MODE: undefined });
    await setPending(SID, proposeTryOns(["W01"], 0));
    const r = await approveTryOn(req({ itemId: "W01", faceId: "P1B" }), tryOnRoute);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: "mock:rec__P1B__W01", recording: true, unitsCharged: 0, unitsUsed: 0 });
    expect(await unitsUsed(SID)).toBe(0);
  });

  it("through the real try-on route in live mode (fake YouCam): one create, 2 units on the session", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ahead-fx-"));
    setEnv({ YOUCAM_MODE: "live", YOUCAM_API_KEY: "test-key", AHEAD_FIXTURES_DIR: tmp });
    const yc = fakeYoucam(300);
    await setPending(SID, proposeTryOns(["W01"], 0));
    const r = await approveTryOn(req({ itemId: "W01", faceId: "F1" }), tryOnRoute);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ mode: "live", unitsCharged: TRYON_UNITS, unitsUsed: TRYON_UNITS });
    expect(yc.creates()).toBe(1);
  });
});
