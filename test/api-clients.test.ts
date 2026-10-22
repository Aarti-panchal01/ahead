import { describe, expect, it, vi } from "vitest";
import { cleanDraft, createBrief, expiryLine, getBrief } from "@/lib/client/briefApi";
import { CARE_TEAM_LINE, FALLBACK_LINE, addDays, byDate, isPlanResponse, planMessages, planSteps, localPlan, requestPlan, withCareTeamLine } from "@/lib/client/planApi";
import type { PlanResponse, StylistBrief } from "@/lib/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NOW = new Date("2026-10-22T10:00:00Z");
const calls = (f: typeof fetch) => (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
const answer = (res: () => Response) => vi.fn(async () => res()) as unknown as typeof fetch;

describe("brief client", () => {
  const brief: StylistBrief = { id: "abc123", createdAt: NOW.toISOString(), expiresAt: "2026-10-29T10:00:00Z", items: ["W01"], hairColour: "#706D6B" };

  it("posts only clean fields and returns the server's brief", async () => {
    const f = answer(() => json(brief, 201));
    const r = await createBrief({ items: ["W01", "W01", "nope"], hairColour: "#706d6b", notes: "  short  " }, f);
    expect(r).toEqual({ ok: true, brief });
    const [url, init] = calls(f)[0];
    expect(url).toBe("/api/brief");
    expect(JSON.parse(String(init.body))).toEqual({ items: ["W01"], hairColour: "#706D6B", notes: "short" });
  });

  it("refuses an empty brief without calling the server", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await createBrief({ items: [] }, f)).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("never makes a brief without the server (no self-contained links)", async () => {
    const r = await createBrief({ items: ["W04"] }, answer(() => new Response("", { status: 404 })));
    expect(r.ok).toBe(false);
  });

  it("maps 404 and 410 to plain messages, and checks expiry itself", async () => {
    expect((await getBrief("gone1", answer(() => new Response("", { status: 410 })))).status).toBe("expired");
    expect((await getBrief("nope1", answer(() => new Response("", { status: 404 })))).status).toBe("missing");
    const stale = { ...brief, expiresAt: "2026-10-01T00:00:00Z" };
    expect((await getBrief("abc123", answer(() => json(stale)), NOW)).status).toBe("expired");
    expect(await getBrief("abc123", answer(() => json(brief)), NOW)).toEqual({ status: "ok", brief });
    expect((await getBrief("../etc", vi.fn() as unknown as typeof fetch)).status).toBe("missing");
  });

  it("caps notes and drops bad colours", () => {
    expect(cleanDraft({ items: ["W01"], hairColour: "red", notes: "x".repeat(900) })).toMatchObject({ hairColour: undefined, notes: "x".repeat(400) });
  });

  it("says when the link stops working", () => {
    expect(expiryLine("2026-10-29T10:00:00Z")).toBe("This link stops working on 29 October 2026.");
  });
});

describe("plan client", () => {
  const server: PlanResponse = {
    timeline: [{ date: "2026-10-22", label: "Try on wigs" }], shortlist: ["W01"], brief: "b", messages: ["m"], source: "llm", unitsUsed: 2,
    pendingApproval: [{ tool: "try_on", itemId: "W06", units: 2 }],
  };

  it("posts the request with the session header and returns the agent's plan", async () => {
    const f = answer(() => json(server));
    const r = await requestPlan({ stage: "not_yet", personaId: "P1", firstTreatmentDate: "2026-11-10" }, f, "2026-10-22", { "x-ahead-session": "abcdefgh" });
    expect(r).toEqual(server);
    const [url, init] = calls(f)[0];
    expect(url).toBe("/api/agent/plan");
    expect(init.headers).toMatchObject({ "x-ahead-session": "abcdefgh" });
    expect(JSON.parse(String(init.body))).toEqual({ stage: "not_yet", personaId: "P1", firstTreatmentDate: "2026-11-10", today: "2026-10-22" });
  });

  it("uses the local plan when the route is missing or answers nonsense", async () => {
    for (const res of [() => new Response("", { status: 404 }), () => json({ hello: 1 })]) {
      const r = await requestPlan({ stage: "not_yet", personaId: "P2" }, answer(res), "2026-10-22");
      expect(r.source).toBe("fallback");
      expect(r.unitsUsed).toBe(0);
      expect(r.pendingApproval).toBeUndefined();
    }
  });

  it("local plan: dated steps from the facts, sorted, ending with the care-team line", () => {
    const p = localPlan({ stage: "not_yet", personaId: "P1", firstTreatmentDate: "2026-11-10" }, "2026-10-22");
    expect(isPlanResponse(p)).toBe(true);
    expect(p.timeline.map((t) => t.date)).toEqual(["2026-10-22", "2026-11-03", "2026-11-10", "2026-12-01"]);
    // The wig is ready ON the first treatment date, not after it.
    expect(p.timeline.find((t) => t.date === "2026-11-10")?.label).toBe("Have your wig or a wrap ready");
    expect(p.messages.at(-1)).toBe(CARE_TEAM_LINE);
    expect(p.shortlist[0]).toBe("W01");
    expect(p.brief).toMatch(/lock of my hair/);
  });

  it("local plan without a date has no calendar steps; hair gone skips the before steps", () => {
    expect(localPlan({ stage: "not_yet", personaId: "P3" }, "2026-10-22").timeline).toHaveLength(1);
    const gone = localPlan({ stage: "gone", personaId: "P3", firstTreatmentDate: "2026-11-10" }, "2026-10-22");
    expect(gone.timeline.map((t) => t.label)).toEqual(["Try on wigs, wraps and brows"]);
  });

  it("no medical wording in the local plan", () => {
    const p = localPlan({ stage: "not_yet", hairColour: "#232228", firstTreatmentDate: "2026-11-10" }, "2026-10-22");
    const text = [...p.timeline.flatMap((t) => [t.label, t.note ?? ""]), ...p.messages, p.brief].join(" ").toLowerCase();
    for (const w of ["cure", "prevent", "dose", "chemo", "medication", "diagnos", "symptom"]) expect(text).not.toContain(w);
  });

  it("accepts undated steps and keeps them after the dated ones", () => {
    const steps = [{ label: "Any time" }, { date: "2026-11-10", label: "b" }, { date: "2026-10-22", label: "a" }];
    expect(isPlanResponse({ ...server, timeline: steps })).toBe(true);
    expect([...steps].sort(byDate).map((t) => t.label)).toEqual(["a", "b", "Any time"]);
  });

  it("shows the fixed lines once: no repeated planner notice or care-team line", () => {
    const p: PlanResponse = {
      ...server, source: "fallback",
      messages: ["Hello", FALLBACK_LINE, "Hello", CARE_TEAM_LINE],
      timeline: [{ date: "2026-10-22", label: "Try on" }, { label: CARE_TEAM_LINE }],
    };
    expect(planMessages(p)).toEqual(["Hello"]);
    expect(planSteps(p).map((t) => t.label)).toEqual(["Try on"]);
  });

  it("says plainly when the simple planner was used", () => {
    expect(FALLBACK_LINE).toBe("We used our simple planner because the AI planner was unavailable.");
  });

  it("adds the care-team line once", () => {
    expect(withCareTeamLine(["a"])).toEqual(["a", CARE_TEAM_LINE]);
    expect(withCareTeamLine(["a", CARE_TEAM_LINE])).toEqual(["a", CARE_TEAM_LINE]);
  });

  it("adds calendar days across month ends", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
