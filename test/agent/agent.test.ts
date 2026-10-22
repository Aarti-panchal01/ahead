import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planRoute } from "@/app/api/agent/plan/route";
import { defaultModel, runPlan, toLines } from "@/lib/agent/agent";
import { claimUnits, getPending, SESSION_CAP_UNITS } from "@/lib/agent/budget";
import { findClaims, SAFE_LINE } from "@/lib/agent/claims";
import type { McpCapabilities } from "@/lib/agent/mcp";
import { CARE_TEAM_LINE } from "@/lib/agent/timeline";
import { setStore } from "@/lib/store";
import type { PlanResponse } from "@/lib/types";
import { freshStore } from "../platform/helpers";
import { failingModel, mockModel } from "./helpers";

const SID = "sess_agent_0001";
const now = new Date("2026-10-22T09:00:00Z");
const mcp = async (): Promise<McpCapabilities> => ({ reachable: true, toolCount: 50, hairTools: [], tryOnToolListed: true, tryOnPath: "rest" });

function expectSafe(p: PlanResponse) {
  const all = [...p.messages, p.brief, ...p.timeline.flatMap((t) => [t.label, t.note ?? ""])].join("\n");
  expect(findClaims(all)).toEqual([]);
}

beforeEach(() => { freshStore(); });
afterEach(() => { vi.unstubAllEnvs(); setStore(null); });

describe("consult agent, deterministic fallback", () => {
  it("no model: same PlanResponse shape with source fallback", async () => {
    const p = await runPlan({ stage: "not_yet", firstTreatmentDate: "2026-11-02", personaId: "P1" }, { sessionId: SID, now });
    expect(p.source).toBe("fallback");
    expect(p.shortlist).toHaveLength(4);
    expect(p.timeline.at(-1)!.label).toBe(CARE_TEAM_LINE);
    expect(p.timeline[1]).toMatchObject({ date: "2026-11-08" });
    expect(p.brief).toMatch(/bring a lock of hair/);
    expect(p.pendingApproval!.map((x) => x.itemId)).toEqual(p.shortlist.slice(0, 3));
    expect(p.unitsUsed).toBe(0);
    expect(p.messages.length).toBeGreaterThan(1);
    expectSafe(p);
    expect(await getPending(SID)).toEqual(p.pendingApproval);
  });

  it("the LLM erroring gives the fallback", async () => {
    const p = await runPlan({ stage: "gone", personaId: "P3" }, { sessionId: SID, now, model: failingModel(), mcp });
    expect(p.source).toBe("fallback");
    expect(p.shortlist.length).toBeGreaterThan(0);
  });

  it("at the cap nothing is proposed and the message says so", async () => {
    await claimUnits(SID, SESSION_CAP_UNITS);
    const p = await runPlan({ stage: "not_yet", personaId: "P2" }, { sessionId: SID, now });
    expect(p.pendingApproval).toEqual([]);
    expect(p.unitsUsed).toBe(SESSION_CAP_UNITS);
    expect(p.messages.join(" ")).toMatch(/used its try-on units/);
  });

  it("defaultModel needs ANTHROPIC_API_KEY", () => {
    expect(defaultModel({})).toBeUndefined();
    const m = defaultModel({ ANTHROPIC_API_KEY: "sk-test" }) as { modelId: string };
    expect(m.modelId).toBe("claude-sonnet-5-5");
  });
});

describe("consult agent, LLM path (mock model + recorded tool-call transcript)", () => {
  it("runs the tools, keeps paid steps pending, filters unknown ids and lints the text", async () => {
    const model = mockModel();
    const p = await runPlan(
      { stage: "not_yet", firstTreatmentDate: "2026-11-02", personaId: "P1", preferences: { notes: "Likes curls." } },
      { sessionId: SID, now, model, mcp },
    );
    expect(p.source).toBe("llm");
    expect(model.doGenerateCalls).toHaveLength(3);
    // shortlist tool asked for wraps
    expect(p.shortlist.some((id) => id.startsWith("H") || !id.startsWith("W"))).toBe(true);
    // try_on: W99 is not in the shortlist; W01..W03 only if shortlisted; never more than 3; never run
    expect(p.pendingApproval!.length).toBeLessThanOrEqual(3);
    expect(p.pendingApproval!.every((x) => p.shortlist.includes(x.itemId) && x.itemId !== "W99")).toBe(true);
    expect(p.unitsUsed).toBe(0);
    // draft_brief with the user's notes and the model's note
    expect(p.brief).toContain("Long soft curls, salt and pepper");
    expect(p.brief).toContain("Likes curls. Prefers a soft fringe.");
    // the medical sentence from the transcript was replaced
    expect(p.messages[2]).toBe(`${SAFE_LINE} Previews show style and colour, not cap fit, density or comfort.`);
    expect(p.messages.join(" ")).not.toMatch(/prevent hair loss/);
    expect(p.messages[1]).toBe("Each try-on waits for your OK before anything runs.");
    expectSafe(p);
    // the tools were offered to the model; no temperature is sent (claude-sonnet-5-5 rejects it)
    const call = model.doGenerateCalls[0];
    expect(call.tools!.map((t) => t.name).sort()).toEqual(["draft_brief", "plan_timeline", "shortlist", "try_on", "youcam_capabilities"]);
    expect(call.temperature).toBeUndefined();
  });

  it("an empty answer falls back", async () => {
    const empty = mockModel([{ content: [{ type: "text", text: "  " }], finishReason: { unified: "stop", raw: "end_turn" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }]);
    const p = await runPlan({ stage: "started" }, { sessionId: SID, now, model: empty, mcp });
    expect(p.source).toBe("fallback");
  });

  it("toLines strips bullets and markdown, max 4", () => {
    expect(toLines("- **One**\n2. Two\n\n* Three\nFour\nFive")).toEqual(["One", "Two", "Three", "Four"]);
  });
});

describe("POST /api/agent/plan", () => {
  const post = (body: unknown, sid: string | null = SID) =>
    planRoute(new Request("http://localhost/api/agent/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sid ? { "x-ahead-session": sid } : {}) },
      body: JSON.stringify(body),
    }));

  it("validates the session and the body", async () => {
    expect((await post({ stage: "not_yet" }, null)).status).toBe(400);
    expect((await post({ stage: "soon" })).status).toBe(400);
    const bad = await post({ stage: "not_yet", firstTreatmentDate: "2026-02-30" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toMatch(/firstTreatmentDate/);
    expect((await post({ stage: "not_yet", hairColour: "brown" })).status).toBe(400);
  });

  it("without ANTHROPIC_API_KEY answers with the fallback", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await post({ stage: "not_yet", firstTreatmentDate: "", personaId: "P4", preferences: { wantsWraps: true } });
    expect(r.status).toBe(200);
    const p = (await r.json()) as PlanResponse;
    expect(p.source).toBe("fallback");
    expect(p.timeline.every((t) => t.date === "")).toBe(true);
    expect(p.pendingApproval!.every((x) => x.tool === "try_on" && x.units === 2)).toBe(true);
  });
});
