import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, setStore, type Store } from "@/lib/store";
import { getItem } from "@/lib/catalogue";
import { POST as endRoute } from "@/app/api/session/end/route";
import { POST as briefPost } from "@/app/api/brief/route";
import { GET as briefGet } from "@/app/api/brief/[id]/route";
import { GET as resultRoute } from "@/app/api/result/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { deleteTask } from "@/lib/youcam/client";
import { endNote } from "@/lib/youcam/session";
import { BRIEF_TTL_S, getBrief } from "@/lib/store/briefs";
import { markEnded, recordCall, trackSession, isEnded, cachePut, cacheGet } from "@/lib/youcam/safety";
import { fakeYoucam, freshStore, jpeg } from "./helpers";

const SID = "session-abc123";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const end = (sid = SID) => endRoute(post({}, { "x-ahead-session": sid }));
const call = (taskId: string) => ({ at: "t", feature: "hair-transfer", taskId, units: 2, day: "2026-10-22", kind: "tryon" as const });
const result = (id: string) => resultRoute(new Request(`http://x/api/result?id=${encodeURIComponent(id)}`));
const ITEM = "W01";

beforeEach(() => { freshStore(); vi.stubEnv("YOUCAM_API_KEY", "secret-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); setStore(null); });

describe("deleteTask", () => {
  it("sends the documented request with the bearer key and maps the answers", async () => {
    const fy = fakeYoucam();
    fy.taskStatus.a = { task_status: "success" };
    expect(await deleteTask("a")).toBe("deleted");
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.at(-1)!;
    expect(url).toBe("https://yce-api-01.makeupar.com/s2s/v2.0/task/delete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ task_id: "a" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(await deleteTask("a")).toBe("gone"); // InvalidTaskId
    fy.taskStatus.b = { task_status: "running" };
    expect(await deleteTask("b")).toBe("not_finished"); // OperationInvalid
    fy.deleteBroken = true;
    expect(await deleteTask("b")).toBe("failed");
  });
  it("treats OperationNotSupport and InvalidParameters as failed", async () => {
    for (const error of ["OperationNotSupport", "InvalidParameters"]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: 400, error }), { status: 400 })));
      expect(await deleteTask("x")).toBe("failed");
    }
  });
});

describe("POST /api/session/end", () => {
  it("deletes finished live tasks, skips mock ids, forgets cache entries, and says so", async () => {
    const fy = fakeYoucam();
    fy.taskStatus.t1 = { task_status: "success" };
    fy.taskStatus.t2 = { task_status: "error", error: "error_no_face" };
    await trackSession(SID, "t1"); await trackSession(SID, "t2"); await trackSession(SID, "mock:rec__P1B__W01");
    await cachePut("k1", "t1");
    const j = await (await end()).json();
    expect(j).toMatchObject({ ended: true, deleted: 2, skipped: 0, failed: 0, mock: 1, forgotten: 3, deletedAtYoucam: true });
    expect(j.note).toBe("We removed this session from our records and deleted your photos and renders from YouCam.");
    expect(fy.deleted).toEqual(new Set(["t1", "t2"]));
    expect(fy.calls.some((c) => c.url.includes("mock"))).toBe(false);
    expect(await cacheGet("k1")).toBeNull();
    expect((await endRoute(post({}))).status).toBe(400);
  });

  it("leaves running tasks, says so, and a second end finishes the job", async () => {
    const fy = fakeYoucam();
    fy.taskStatus.done = { task_status: "success" };
    fy.taskStatus.busy = { task_status: "running" };
    await trackSession(SID, "done"); await trackSession(SID, "busy");
    const j = await (await end()).json();
    expect(j).toMatchObject({ deleted: 1, skipped: 1, failed: 0, deletedAtYoucam: false });
    expect(j.note).toMatch(/1 render was still being made.*within 30 days/);
    expect(fy.deleted.has("busy")).toBe(false);
    expect(await isEnded("busy")).toBe(true);
    fy.taskStatus.busy = { task_status: "success" };
    expect(await (await end()).json()).toMatchObject({ deleted: 1, skipped: 0 });
    expect(fy.deleted.has("busy")).toBe(true);
  });

  it("counts a failed delete or an unreadable status as failed, never throws", async () => {
    const fy = fakeYoucam();
    fy.taskStatus.t1 = { task_status: "success" };
    fy.deleteBroken = true;
    await trackSession(SID, "t1");
    const r = await end();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ deleted: 0, failed: 1, deletedAtYoucam: false });
    expect(j.note).toMatch(/could not be deleted/);
  });

  it("nothing tracked: only our records", async () => {
    fakeYoucam();
    const j = await (await end()).json();
    expect(j).toMatchObject({ ended: true, deleted: 0, skipped: 0, failed: 0, forgotten: 0, deletedAtYoucam: false });
    expect(j.note).toMatch(/Nothing of yours was held at YouCam/);
  });

  it("endNote wording", () => {
    expect(endNote({ live: 3, deleted: 1, skipped: 2, failed: 0 })).toBe(
      "We removed this session from our records and deleted 1 from YouCam. 2 renders were still being made, so they were left for now. YouCam removes them automatically within 30 days.");
  });
});

describe("GET /api/result", () => {
  it("streams a finished live render same-origin, no-store, without leaking the url or key", async () => {
    const fy = fakeYoucam();
    fy.resultBytes = await jpeg();
    fy.taskStatus.t1 = { task_status: "success", results: [{ url: "https://cdn.example/t1.jpg" }] };
    await recordCall(call("t1"));
    const r = await result("t1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await r.arrayBuffer()).equals(fy.resultBytes)).toBe(true);
    expect(JSON.stringify([...r.headers])).not.toMatch(/cdn\.example|secret-key/);
    const cdn = (fetch as unknown as { mock: { calls: [string | URL, RequestInit?][] } }).mock.calls.find((c) => String(c[0]).startsWith("https://cdn.example"))!;
    expect(JSON.stringify(cdn[1] ?? {})).not.toMatch(/secret-key|Authorization/);
    expect(fy.deleted.size).toBe(0); // session not ended: nothing deleted
  });

  it("deletes the task at YouCam right after reading it when the session already ended", async () => {
    const fy = fakeYoucam();
    fy.resultBytes = await jpeg();
    fy.taskStatus.t1 = { task_status: "success", results: [{ url: "https://cdn.example/t1.jpg" }] };
    await recordCall(call("t1"));
    await markEnded("t1");
    expect((await result("t1")).status).toBe(200);
    expect(fy.deleted.has("t1")).toBe(true);
    expect(await isEnded("t1")).toBe(false);
  });

  it("refuses ids this deployment did not create, and makes no YouCam call", async () => {
    const fy = fakeYoucam();
    const r = await result("someone-elses-task");
    expect(r.status).toBe(404);
    expect(fy.calls.length).toBe(0);
    expect((await result("../../etc")).status).toBe(404);
    expect((await result("")).status).toBe(404);
  });

  it("running -> 409, error -> 404, unsafe result url -> 502, bad download -> 502", async () => {
    const fy = fakeYoucam();
    await recordCall(call("run")); await recordCall(call("err")); await recordCall(call("evil")); await recordCall(call("dead"));
    fy.taskStatus.run = { task_status: "running" };
    fy.taskStatus.err = { task_status: "error", error: "error_no_face" };
    fy.taskStatus.evil = { task_status: "success", results: [{ url: "https://127.0.0.1/x.jpg" }] };
    fy.taskStatus.dead = { task_status: "success", results: [{ url: "https://cdn.example/dead.jpg" }] };
    expect((await result("run")).status).toBe(409);
    expect((await result("err")).status).toBe(404);
    expect((await result("evil")).status).toBe(502);
    expect((await result("dead")).status).toBe(502);
    const body = await (await result("evil")).json();
    expect(JSON.stringify(body)).not.toMatch(/127\.0\.0\.1/);
  });

  it("mock ids redirect to the fixture", async () => {
    const r = await result("mock:rec__P3B__W08");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/api/fixtures/rec__P3B__W08");
    expect((await result("mock:nope__nope")).status).toBe(404);
  });
});

describe("stylist brief", () => {
  const ok = { items: [ITEM], hairColour: "#42280e", browColour: "#4E362A", notes: "  Shoulder length, soft fringe.  " };

  it("creates a brief with an unguessable id and a 7 day expiry, then fetches it", async () => {
    expect(getItem(ITEM)).toBeTruthy();
    const r = await briefPost(post(ok));
    expect(r.status).toBe(201);
    const b = await r.json();
    expect(b.id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(b).toMatchObject({ items: [ITEM], hairColour: "#42280E", browColour: "#4E362A", notes: "Shoulder length, soft fringe." });
    expect(Date.parse(b.expiresAt) - Date.parse(b.createdAt)).toBe(BRIEF_TTL_S * 1000);
    const g = await briefGet(new Request("http://x"), { params: Promise.resolve({ id: b.id }) });
    expect(g.status).toBe(200);
    expect(await g.json()).toEqual(b);
  });

  it("ids are unique", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add((await (await briefPost(post({ items: [ITEM] }))).json()).id);
    expect(ids.size).toBe(5);
  });

  it("rejects bad input with a 400 and a plain message", async () => {
    const bad: unknown[] = [
      {}, { items: [] }, { items: ["NOPE"] }, { items: [1] }, { items: "W01" },
      { items: [ITEM], hairColour: "red" }, { items: [ITEM], browColour: "#12345" },
      { items: [ITEM], notes: "x".repeat(501) }, { items: [ITEM], notes: 5 }, "not json{",
    ];
    for (const b of bad) {
      const r = await briefPost(post(b));
      expect(r.status).toBe(400);
      expect((await r.json()).message).toMatch(/couldn't be saved/);
    }
    expect((await briefPost(post({ items: [ITEM], notes: "x".repeat(500) }))).status).toBe(201);
  });

  it("strips control characters from notes and drops duplicate items", async () => {
    const b = await (await briefPost(post({ items: [ITEM, ITEM], notes: "a\u0000b\u0007c\nd" }))).json();
    expect(b.items).toEqual([ITEM]);
    expect(b.notes).toBe("abc\nd");
  });

  it("returns 404 with the plain message for unknown, malformed and expired ids", async () => {
    for (const id of ["doesnotexist1234567890", "short", "../x"]) {
      const g = await briefGet(new Request("http://x"), { params: Promise.resolve({ id }) });
      expect(g.status).toBe(404);
      expect((await g.json()).message).toBe("This brief has expired or the link is wrong.");
    }
    const b = await (await briefPost(post({ items: [ITEM] }))).json();
    expect(await getBrief(b.id, Date.now() + BRIEF_TTL_S * 1000 + 1000)).toBeNull();
  });

  it("is rate limited per IP", async () => {
    vi.stubEnv("AHEAD_BRIEF_LIMIT_PER_HOUR", "2");
    const h = { "x-forwarded-for": "1.2.3.4" };
    expect((await briefPost(post({ items: [ITEM] }, h))).status).toBe(201);
    expect((await briefPost(post({ items: [ITEM] }, h))).status).toBe(201);
    const r = await briefPost(post({ items: [ITEM] }, h));
    expect(r.status).toBe(429);
    expect((await briefPost(post({ items: [ITEM] }, { "x-forwarded-for": "5.6.7.8" }))).status).toBe(201);
  });

  it("answers 503 plainly if the store is down", async () => {
    setStore(brokenStore());
    expect((await briefPost(post({ items: [ITEM] }))).status).toBe(503);
    expect((await briefGet(new Request("http://x"), { params: Promise.resolve({ id: "abcdefghijklmnopqrstuvwx" }) })).status).toBe(503);
  });
});

function brokenStore(): Store {
  const boom = async () => { throw new Error("upstash unreachable"); };
  return { kind: "upstash", get: boom, set: boom, del: boom, incrBy: boom, push: boom, range: boom } as unknown as Store;
}

describe("GET /api/status never throws", () => {
  it("falls back to the mock-safe status when the store is unreachable (live)", async () => {
    vi.stubEnv("YOUCAM_MODE", "live");
    fakeYoucam();
    setStore(brokenStore());
    const r = await statusRoute();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ mode: "live", servingRecordings: true, reason: "unavailable" });
  });
  it("mock mode is unaffected by a broken store", async () => {
    setStore(brokenStore());
    expect(await (await statusRoute()).json()).toMatchObject({ mode: "mock", servingRecordings: false });
  });
  it("works with the in-memory store", async () => {
    setStore(new MemoryStore());
    expect((await statusRoute()).status).toBe(200);
  });
});
