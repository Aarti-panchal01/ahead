import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStore } from "@/lib/store";
import { POST as rawTryon } from "@/app/api/tryon/route";
import { POST as rawListing } from "@/app/api/listing/route";
import { POST as rawTester } from "@/app/api/tester/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { codeMatches } from "@/lib/youcam/tester";
import { fakeYoucam, freshStore, jpeg } from "./helpers";

const CODE = "open-sesame-7731";
const MSG = "Live try-on on your own photo needs a tester code. You can still try our sample people and match wigs to your hair colour.";
let seen: string[];
let bodies: string[];
const spy = (f: (r: Request) => Promise<Response>) => async (r: Request) => {
  const res = await f(r);
  bodies.push(await res.clone().text(), JSON.stringify([...res.headers]));
  return res;
};
const tryonRoute = spy(rawTryon), listingRoute = spy(rawListing), testerRoute = spy(rawTester);

beforeEach(() => {
  freshStore();
  seen = []; bodies = [];
  for (const k of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, k).mockImplementation((...a) => { seen.push(a.map(String).join(" ")); });
  vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k"); vi.stubEnv("TESTER_CODE", CODE);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); setStore(null); });

async function selfieReq(headers: Record<string, string> = {}, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("itemId", "W08");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set("selfie", new File([new Uint8Array(await jpeg())], "me.jpg", { type: "image/jpeg" }));
  return new Request("http://x/api/tryon", { method: "POST", headers, body: form });
}
async function listingReq(headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("selfie", new File([new Uint8Array(await jpeg())], "me.jpg", { type: "image/jpeg" }));
  form.set("listing", new File([new Uint8Array(await jpeg())], "l.jpg", { type: "image/jpeg" }));
  return new Request("http://x/api/listing", { method: "POST", headers, body: form });
}
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Nothing any route answered (body or headers) or logged contains the code. */
function leaks() {
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.join(" | ")).not.toContain(CODE);
  expect(seen.join(" | ")).not.toContain(CODE);
}

describe("tester code gate on live selfie try-on", () => {
  it("no code: 403 with the plain message, fetch never called", async () => {
    const fy = fakeYoucam(300);
    const r = await tryonRoute(await selfieReq());
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ errorCode: "tester_code", message: MSG });
    expect(fy.calls.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    leaks();
  });
  it("wrong code (header or field): 403, no calls", async () => {
    const fy = fakeYoucam(300);
    const a = await tryonRoute(await selfieReq({ "x-ahead-tester": CODE + "x" }));
    const b = await tryonRoute(await selfieReq({}, { testerCode: "nope" }));
    const c = await tryonRoute(await selfieReq({ "x-ahead-tester": "" }));
    expect([a.status, b.status, c.status]).toEqual([403, 403, 403]);
    expect(fy.calls.length).toBe(0);
    leaks();
  });
  it("right code in the header or the form field goes live", async () => {
    const fy = fakeYoucam(300);
    const a = await tryonRoute(await selfieReq({ "x-ahead-tester": CODE }));
    expect(await a.json()).toMatchObject({ mode: "live", id: "task1" });
    const b = await tryonRoute(await selfieReq({}, { testerCode: CODE }));
    expect(b.status).toBe(200);
    expect(fy.creates()).toBe(2);
    leaks();
  });
  it("demo faces and recordings are unaffected, no code needed", async () => {
    const fy = fakeYoucam(300);
    const r = await tryonRoute(json({ itemId: "W08", faceId: "P3B" }));
    expect(await r.json()).toMatchObject({ id: "mock:rec__P3B__W08", recording: true });
    expect(fy.calls.length).toBe(0);
  });
  it("TESTER_CODE unset: behaviour unchanged", async () => {
    vi.stubEnv("TESTER_CODE", "");
    const fy = fakeYoucam(300);
    expect((await tryonRoute(await selfieReq())).status).toBe(200);
    expect(fy.creates()).toBe(1);
  });
  it("listing with a selfie is gated the same way", async () => {
    const fy = fakeYoucam(300);
    const no = await listingRoute(await listingReq());
    expect(no.status).toBe(403);
    expect((await no.json()).errorCode).toBe("tester_code");
    expect(fy.calls.length).toBe(0);
    const yes = await listingRoute(await listingReq({ "x-ahead-tester": CODE }));
    expect(await yes.json()).toMatchObject({ mode: "live", kind: "listing" });
  });
});

describe("POST /api/tester", () => {
  it("200 for the right code, 403 for a wrong or missing one, never echoing the code", async () => {
    const ok = await testerRoute(json({ code: CODE }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const bad = await testerRoute(json({ code: "wrong" }));
    expect(bad.status).toBe(403);
    expect((await bad.json()).errorCode).toBe("tester_code");
    expect((await testerRoute(json({}))).status).toBe(403);
    expect((await testerRoute(json({ code: 5 }))).status).toBe(403);
    leaks();
  });
  it("is rate limited per IP (10 tries an hour), even for the right code", async () => {
    const h = { "x-forwarded-for": "9.9.9.9" };
    for (let i = 0; i < 10; i++) expect((await testerRoute(json({ code: "guess" + i }, h))).status).toBe(403);
    const r = await testerRoute(json({ code: CODE }, h));
    expect(r.status).toBe(429);
    expect((await r.json()).errorCode).toBe("tester_rate_limit");
    expect((await testerRoute(json({ code: CODE }, { "x-forwarded-for": "8.8.8.8" }))).status).toBe(200);
  });
  it("unset TESTER_CODE: nothing to check", async () => {
    vi.stubEnv("TESTER_CODE", "");
    expect((await testerRoute(json({ code: "x" }))).status).toBe(200);
  });
});

describe("status testerRequired and code matching", () => {
  it("true only when TESTER_CODE is set and mode is live", async () => {
    fakeYoucam(300);
    expect((await (await statusRoute()).json()).testerRequired).toBe(true);
    vi.stubEnv("TESTER_CODE", "");
    expect((await (await statusRoute()).json()).testerRequired).toBe(false);
    vi.stubEnv("TESTER_CODE", CODE); vi.stubEnv("YOUCAM_MODE", "mock");
    expect(await (await statusRoute()).json()).toEqual({ mode: "mock", servingRecordings: false, testerRequired: false });
  });
  it("status also reports it when the store is down", async () => {
    setStore({ kind: "upstash", get: async () => { throw new Error("x"); } } as never);
    fakeYoucam(300);
    expect(await (await statusRoute()).json()).toMatchObject({ reason: "unavailable", testerRequired: true });
  });
  it("codeMatches is exact and false without a configured code", () => {
    expect(codeMatches(CODE)).toBe(true);
    expect(codeMatches(CODE.toUpperCase())).toBe(false);
    expect(codeMatches("")).toBe(false);
    vi.stubEnv("TESTER_CODE", "");
    expect(codeMatches("")).toBe(false);
  });
});
