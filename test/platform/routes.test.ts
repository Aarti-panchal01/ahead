import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStore } from "@/lib/store";
import { findRecording, messageFor } from "@/lib/youcam";
import { GET as pollRoute } from "@/app/api/tryon/[id]/route";
import { POST as tryonRoute } from "@/app/api/tryon/route";
import { POST as listingRoute } from "@/app/api/listing/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { claimDaily } from "@/lib/youcam/safety";
import { fakeYoucam, freshStore, jpeg } from "./helpers";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const poll = (id: string, q = "") => pollRoute(new Request(`http://x/api/tryon/${id}${q}`), { params: Promise.resolve({ id }) });

beforeEach(() => { freshStore(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); setStore(null); });

describe("personas in mock mode", () => {
  it.each([
    ["P3B", "W08", "rec__P3B__W08"],
    ["P1B", "W01", "rec__P1B__W01"],
    ["P4B", "W12", "rec__P4B__W12"],
    ["P1B", "H01", "hero__P1B__H01"],
    ["P1B_browsB", "W01", "hero__P1B_browsB__W01"],
  ])("finds %s x %s", (face, item, rec) => {
    expect(findRecording(face, item)).toBe(rec);
  });

  it("POST /api/tryon replays a recorded persona try-on and polling returns the render, labelled a recording", async () => {
    const r = await tryonRoute(post({ itemId: "W08", faceId: "P3B" }));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ id: "mock:rec__P3B__W08", mode: "mock", recording: true });
    const t = await (await poll(j.id)).json();
    expect(t).toMatchObject({ status: "success", resultUrl: "/api/fixtures/rec__P3B__W08", recording: true });
    expect(t.message).toMatch(/recording/);
  });

  it("accepts P1B_browsB for the full look", async () => {
    const j = await (await tryonRoute(post({ itemId: "W01", faceId: "P1B_browsB" }))).json();
    expect(j.id).toBe("mock:hero__P1B_browsB__W01");
  });

  it("answers no_recording with a plain message, and rejects unknown faces and items", async () => {
    const r = await tryonRoute(post({ itemId: "W08", faceId: "P2A" }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ errorCode: "no_recording", message: expect.stringMatching(/isn't recorded yet/) });
    expect((await tryonRoute(post({ itemId: "W08", faceId: "P9B" }))).status).toBe(400);
    expect((await tryonRoute(post({ itemId: "NOPE", faceId: "P3B" }))).status).toBe(400);
    expect((await tryonRoute(post({ itemId: "W08", faceId: "../P3B" }))).status).toBe(400);
  });

  it("works from a temp fixtures folder (new recordings are found without code changes)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-"));
    fs.writeFileSync(path.join(dir, "rec__P2B__W99.json"), "{}");
    vi.stubEnv("AHEAD_FIXTURES_DIR", dir);
    expect(findRecording("P2B", "W99")).toBe("rec__P2B__W99");
  });
});

describe("GET /api/status", () => {
  it("mock mode", async () => {
    expect(await (await statusRoute()).json()).toEqual({ mode: "mock", servingRecordings: false, testerRequired: false });
  });
  it("live mode reports remaining units and flips to recordings at the cap", async () => {
    vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k");
    fakeYoucam(300);
    expect(await (await statusRoute()).json()).toEqual({ mode: "live", servingRecordings: false, remainingToday: 20, testerRequired: false });
    for (let i = 0; i < 10; i++) await claimDaily(2);
    expect(await (await statusRoute()).json()).toMatchObject({ servingRecordings: true, remainingToday: 0, reason: "daily_cap" });
  });
  it("live mode flips to recordings when the balance is at the reserve", async () => {
    vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k");
    fakeYoucam(150);
    expect(await (await statusRoute()).json()).toMatchObject({ servingRecordings: true, reason: "reserve" });
  });
});

const selfieReq = async (itemId = "W08") => {
  const form = new FormData();
  form.set("itemId", itemId);
  form.set("selfie", new File([new Uint8Array(await jpeg())], "me.jpg", { type: "image/jpeg" }));
  return new Request("http://x/api/tryon", { method: "POST", body: form });
};

describe("live mode: demo faces never go live", () => {
  beforeEach(() => { vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k"); });

  it("demo face + recording: the recording, labelled, 0 units, fetch never called", async () => {
    const fy = fakeYoucam(300);
    const j = await (await tryonRoute(post({ itemId: "W08", faceId: "P3B" }))).json();
    expect(j).toMatchObject({ id: "mock:rec__P3B__W08", mode: "mock", recording: true });
    expect(fy.calls.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("demo face without a recording: plain no_recording, fetch never called", async () => {
    const fy = fakeYoucam(300);
    const r = await tryonRoute(post({ itemId: "W08", faceId: "P2A" }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ errorCode: "no_recording" });
    expect(fy.calls.length).toBe(0);
  });
  it("sample people can auto-render every card with no calls, even with a huge cap", async () => {
    vi.stubEnv("AHEAD_DAILY_UNIT_CAP", "1000");
    const fy = fakeYoucam(1000);
    for (const item of ["W01", "W02", "W03", "W05"]) await tryonRoute(post({ itemId: item, faceId: "P1B" }));
    expect(fy.calls.length).toBe(0);
  });
  it("an uploaded selfie goes live through the ledger", async () => {
    const fy = fakeYoucam(300);
    const j = await (await tryonRoute(await selfieReq())).json();
    expect(j).toMatchObject({ id: "task1", mode: "live" });
    expect(j.recording).toBeUndefined();
    expect(fy.creates()).toBe(1);
  });
  it("selfie at the daily cap or the reserve: plain message, never a recording", async () => {
    fakeYoucam(300);
    vi.stubEnv("AHEAD_DAILY_UNIT_CAP", "0");
    const r = await tryonRoute(await selfieReq());
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ errorCode: "daily_cap", message: expect.stringMatching(/paused for today/) });
    vi.stubEnv("AHEAD_DAILY_UNIT_CAP", "20");
    vi.unstubAllGlobals();
    const fy = fakeYoucam(150);
    expect((await (await tryonRoute(await selfieReq())).json()).errorCode).toBe("reserve");
    expect(fy.creates()).toBe(0);
  });
  it("rejects a non-image selfie upload with a plain message", async () => {
    fakeYoucam(300);
    const form = new FormData();
    form.set("itemId", "W08");
    form.set("selfie", new File(["hello"], "me.txt", { type: "text/plain" }));
    const r = await tryonRoute(new Request("http://x/api/tryon", { method: "POST", body: form }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ errorCode: "not_image" });
  });
});

describe("POST /api/listing", () => {
  it("mock mode: needs live, with the recorded no-face example", async () => {
    const j = await (await listingRoute(post({ url: "https://shop.example.com/wig.jpg", faceId: "P1B" }))).json();
    expect(j).toMatchObject({ status: "needs_live", mode: "mock", exampleTaskId: "mock:p2__F1__W5" });
    expect(j.message).toMatch(/need live mode/);
    const ex = await (await poll(j.exampleTaskId, "?for=listing")).json();
    expect(ex).toMatchObject({ status: "error", errorCode: "error_no_face" });
    expect(ex.message).toContain("This photo has no one wearing the wig, so we can't preview it");
  });
  it("blocks private and non-https links, and asks for a listing", async () => {
    for (const url of ["https://127.0.0.1/a.jpg", "https://169.254.169.254/x", "http://shop.example.com/a.jpg", "https://localhost/a.jpg"]) {
      const r = await listingRoute(post({ url, faceId: "P1B" }));
      expect(r.status).toBe(422);
    }
    expect((await listingRoute(post({ faceId: "P1B" }))).status).toBe(400);
  });
  it("live: an upload is sent as the reference and refusals use the listing wording", async () => {
    vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k");
    const fy = fakeYoucam(300);
    const form = new FormData();
    form.set("selfie", new File([new Uint8Array(await jpeg())], "me.jpg", { type: "image/jpeg" }));
    form.set("listing", new File([new Uint8Array(await jpeg())], "listing.jpg", { type: "image/jpeg" }));
    const r = await listingRoute(new Request("http://x/api/listing", { method: "POST", body: form }));
    const j = await r.json();
    expect(j).toMatchObject({ mode: "live", kind: "listing", id: "task1" });
    fy.taskStatus.task1 = { task_status: "error", error: "error_no_face", results: null };
    const t = await (await poll("task1")).json();
    expect(t).toMatchObject({ status: "error", errorCode: "error_no_face", unitsCharged: 0 });
    expect(t.message).toContain("This photo has no one wearing the wig, so we can't preview it");
  });
  it("live: a demo face never goes live, it gets the needs_live answer with no YouCam call", async () => {
    vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k");
    const fy = fakeYoucam(300);
    const form = new FormData();
    form.set("faceId", "P1B");
    form.set("listing", new File([new Uint8Array(await jpeg())], "listing.jpg", { type: "image/jpeg" }));
    const j = await (await listingRoute(new Request("http://x/api/listing", { method: "POST", body: form }))).json();
    expect(j).toMatchObject({ status: "needs_live" });
    expect(fy.calls.length).toBe(0);
  });
  it("live: a link to a non-image or private host is refused before any YouCam call", async () => {
    vi.stubEnv("YOUCAM_MODE", "live"); vi.stubEnv("YOUCAM_API_KEY", "k");
    const fy = fakeYoucam(300);
    const r = await listingRoute(post({ url: "https://10.0.0.1/a.jpg", faceId: "P1B" }));
    expect(r.status).toBe(422);
    expect(fy.calls.length).toBe(0);
  });
});

describe("plain messages", () => {
  const docCodes = [
    "exceed_max_filesize", "invalid_parameter", "error_download_image", "error_download_mask", "error_decode_image", "error_decode_mask",
    "error_download_video", "error_decode_video", "error_nsfw_content_detected", "error_no_face", "error_pose", "error_face_parsing",
    "error_inference", "exceed_nsfw_retry_limits", "error_upload", "error_multiple_people", "error_no_shoulder", "error_large_face_angle",
    "error_hair_too_short", "error_unexpected_video_duration", "error_bald_image", "error_unsupport_ratio", "unknown_internal_error",
    "error_insufficient_landmarks", "error_face_pose", "error_face_angle_invalid",
  ];
  const generic = messageFor("something_new");
  it.each(docCodes)("%s has its own plain message", (code) => {
    expect(messageFor(code)).not.toBe(generic);
    expect(messageFor(code)).not.toMatch(/error_|task_status/);
  });
  it("error_no_face on a listing says nobody is wearing the wig", () => {
    expect(messageFor("error_no_face", "listing")).toMatch(/^This photo has no one wearing the wig, so we can't preview it/);
  });
  it("platform codes have messages", () => {
    for (const c of ["reserve", "daily_cap", "rate_limit", "unavailable", "not_image", "too_large", "blocked_url", "needs_live"]) expect(messageFor(c)).not.toBe(generic);
  });
});
