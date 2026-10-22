import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as tryOnRoute } from "@/app/api/tryon/route";
import { claimUnits, getPending, SESSION_CAP_UNITS, setPending, unitsUsed } from "@/lib/agent/budget";
import { approveTryOn, MAX_PROPOSED, proposeTryOns, TRYON_UNITS, type TryOnHandler } from "@/lib/agent/tryon";
import { setStore } from "@/lib/store";
import { fakeYoucam, freshStore, jpeg, setEnv } from "../platform/helpers";

const SID = "sess_approve_01";
const URL_ = "http://localhost/api/agent/approve";

/** Demo face: JSON { itemId, faceId }. */
const demoReq = (body: unknown, sid: string | null = SID) =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sid ? { "x-ahead-session": sid } : {}) },
    body: JSON.stringify(body),
  });

/** Uploaded selfie: multipart { itemId, selfie }. */
async function selfieReq(itemId: string | null, sid: string | null = SID, bytes?: Buffer) {
  const form = new FormData();
  if (itemId) form.set("itemId", itemId);
  form.set("selfie", new Blob([new Uint8Array(bytes ?? (await jpeg()))], { type: "image/jpeg" }), "me.jpg");
  return new Request(URL_, { method: "POST", headers: sid ? { "x-ahead-session": sid } : {}, body: form });
}

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

describe("POST /api/agent/approve, uploaded selfie (paid path)", () => {
  it("needs a session, an item id and an item the plan proposed", async () => {
    const run = vi.fn<TryOnHandler>(ok({}));
    expect((await approveTryOn(await selfieReq("W01", null), run)).status).toBe(400);
    expect((await approveTryOn(await selfieReq(null), run)).status).toBe(400);
    const r = await approveTryOn(await selfieReq("W01"), run);
    expect(r.status).toBe(403);
    expect((await r.json()).errorCode).toBe("not_proposed");
    expect(run).not.toHaveBeenCalled();
  });

  it("a live render is charged against the cap, leaves the approval list and forwards the same body", async () => {
    await setPending(SID, proposeTryOns(["W01", "W02"], 0));
    const run = vi.fn<TryOnHandler>(ok({ id: "task1", itemId: "W01", mode: "live" }));
    const r = await approveTryOn(await selfieReq("W01"), run);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ id: "task1", unitsCharged: TRYON_UNITS, unitsUsed: TRYON_UNITS });
    expect(j.pendingApproval.map((p: { itemId: string }) => p.itemId)).toEqual(["W02"]);
    const fwd = run.mock.calls[0][0] as Request;
    expect(new URL(fwd.url).pathname).toBe("/api/tryon");
    expect(fwd.headers.get("x-ahead-session")).toBe(SID);
    const form = await fwd.formData();
    expect(form.get("itemId")).toBe("W01");
    expect(form.get("selfie")).toBeInstanceOf(Blob);
    // Approving the same item twice does nothing.
    expect((await approveTryOn(await selfieReq("W01"), run)).status).toBe(403);
  });

  it("errors cost nothing and put the step back", async () => {
    await setPending(SID, proposeTryOns(["W02"], 0));
    const err = await approveTryOn(await selfieReq("W02"), ok({ errorCode: "error_no_face", message: "m" }, 502));
    expect(err.status).toBe(502);
    expect((await err.json()).unitsCharged).toBe(0);
    expect(await unitsUsed(SID)).toBe(0);
    expect((await getPending(SID)).map((p) => p.itemId)).toEqual(["W02"]);
  });

  it("refuses at the cap without calling the try-on path", async () => {
    await setPending(SID, proposeTryOns(["W01"], 0));
    await claimUnits(SID, SESSION_CAP_UNITS);
    const run = vi.fn<TryOnHandler>(ok({}));
    const r = await approveTryOn(await selfieReq("W01"), run);
    expect(r.status).toBe(429);
    expect((await r.json()).errorCode).toBe("session_cap");
    expect(run).not.toHaveBeenCalled();
    expect((await getPending(SID)).map((p) => p.itemId)).toEqual(["W01"]);
  });

  it("through the real try-on route in live mode (fake YouCam): one create, 2 units on the session", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ahead-fx-"));
    setEnv({ YOUCAM_MODE: "live", YOUCAM_API_KEY: "test-key", AHEAD_FIXTURES_DIR: tmp });
    const yc = fakeYoucam(300);
    await setPending(SID, proposeTryOns(["W01"], 0));
    const r = await approveTryOn(await selfieReq("W01", SID, await jpeg(600, 800)), tryOnRoute);
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ mode: "live", unitsCharged: TRYON_UNITS, unitsUsed: TRYON_UNITS });
    expect(yc.creates()).toBe(1);
  });
});

describe("POST /api/agent/approve, demo face (free recording)", () => {
  it("live mode, real try-on route: no create, the recording, 0 units, approval list untouched", async () => {
    setEnv({ YOUCAM_MODE: "live", YOUCAM_API_KEY: "test-key" });
    const yc = fakeYoucam(300);
    await setPending(SID, proposeTryOns(["W02"], 0));
    const r = await approveTryOn(demoReq({ itemId: "W01", faceId: "P1B" }), tryOnRoute);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: "mock:rec__P1B__W01", recording: true, mode: "mock", unitsCharged: 0, unitsUsed: 0 });
    expect(yc.creates()).toBe(0);
    expect(await unitsUsed(SID)).toBe(0);
    expect((await getPending(SID)).map((p) => p.itemId)).toEqual(["W02"]);
  });

  it("mock mode: the recording, 0 units; a missing recording is a plain no_recording", async () => {
    setEnv({ YOUCAM_MODE: undefined });
    const r = await approveTryOn(demoReq({ itemId: "W01", faceId: "P1B" }), tryOnRoute);
    expect(await r.json()).toMatchObject({ recording: true, unitsCharged: 0 });
    const none = await approveTryOn(demoReq({ itemId: "W01", faceId: "F7" }), tryOnRoute);
    expect(none.status).toBe(422);
    expect((await none.json()).errorCode).toBe("no_recording");
    expect(await unitsUsed(SID)).toBe(0);
  });

  it("still needs a session", async () => {
    expect((await approveTryOn(demoReq({ itemId: "W01", faceId: "P1B" }, null), ok({}))).status).toBe(400);
  });
});
