import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planRoute } from "@/app/api/agent/plan/route";
import { runPlan, SAMPLE_FREE_LINE, toLines } from "@/lib/agent/agent";
import { claimUnits, getPending, SESSION_CAP_UNITS } from "@/lib/agent/budget";
import { findClaims, SAFE_LINE } from "@/lib/agent/claims";
import type { McpCapabilities } from "@/lib/agent/mcp";
import { GEMINI_MODEL_ID, GROQ_MODEL_ID, plannerModels, PROVIDER_LINE } from "@/lib/agent/providers";
import { CARE_TEAM_LINE } from "@/lib/agent/timeline";
import { setStore } from "@/lib/store";
import type { PlanResponse } from "@/lib/types";
import { freshStore } from "../platform/helpers";
import { asPlanner, failingModel, hangingModel, mockModel, rateLimited } from "./helpers";

const SID = "sess_agent_0001";
const now = new Date("2026-10-22T09:00:00Z");
const mcp = async (): Promise<McpCapabilities> => ({ reachable: true, toolCount: 50, hairTools: [], tryOnToolListed: true, tryOnPath: "rest" });

function expectSafe(p: PlanResponse) {
  const all = [...p.messages, p.brief, ...p.timeline.flatMap((t) => [t.label, t.note ?? ""])].join("\n");
  expect(findClaims(all)).toEqual([]);
}

beforeEach(() => { freshStore(); });
afterEach(() => { vi.unstubAllEnvs(); setStore(null); });

describe("providers", () => {
  it("Gemini first, then Groq; a provider without a key is skipped", () => {
    expect(plannerModels({})).toEqual([]);
    const both = plannerModels({ GOOGLE_GENERATIVE_AI_API_KEY: "g", GROQ_API_KEY: "q" });
    expect(both.map((m) => m.name)).toEqual(["Gemini", "Groq"]);
    expect((both[0].model as { modelId: string }).modelId).toBe(GEMINI_MODEL_ID);
    expect((both[1].model as { modelId: string }).modelId).toBe(GROQ_MODEL_ID);
    expect(plannerModels({ GROQ_API_KEY: "q" }).map((m) => m.name)).toEqual(["Groq"]);
  });
});

describe("consult agent, rule-based plan", () => {
  it("no keys: same PlanResponse shape with source fallback and the plain provider line", async () => {
    const p = await runPlan({ stage: "not_yet", firstTreatmentDate: "2026-11-02", personaId: "P1" }, { sessionId: SID, now });
    expect(p.source).toBe("fallback");
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.fallback);
    expect(p.shortlist).toHaveLength(4);
    expect(p.timeline.at(-1)).toEqual({ label: CARE_TEAM_LINE });
    expect(p.timeline[1]).toMatchObject({ date: "2026-10-26", label: "Order your wig by this date" });
    expect(p.brief).toMatch(/bring a lock of hair/);
    // A sample person's try-ons are free saved recordings: nothing to approve, 0 units.
    expect(p.pendingApproval).toEqual([]);
    expect(p.messages).toContain(SAMPLE_FREE_LINE);
    expect(p.unitsUsed).toBe(0);
    expectSafe(p);
    expect(await getPending(SID)).toEqual([]);
  });

  it("own photo: the top 3 wait for approval (paid, selfie only)", async () => {
    const p = await runPlan({ stage: "not_yet", hairColour: "#655141" }, { sessionId: SID, now });
    expect(p.pendingApproval!.map((x) => x.itemId)).toEqual(p.shortlist.slice(0, 3));
    expect(p.pendingApproval!.every((x) => x.tool === "try_on" && x.units === 2)).toBe(true);
    expect(p.messages.join(" ")).toMatch(/waits for your OK/);
    expect(await getPending(SID)).toEqual(p.pendingApproval);
  });

  it("at the cap nothing is proposed and the message says so", async () => {
    await claimUnits(SID, SESSION_CAP_UNITS);
    const p = await runPlan({ stage: "not_yet", hairColour: "#655141" }, { sessionId: SID, now });
    expect(p.pendingApproval).toEqual([]);
    expect(p.unitsUsed).toBe(SESSION_CAP_UNITS);
    expect(p.messages.join(" ")).toMatch(/used its try-on units/);
  });

  it("health sentences in the notes never reach the brief", async () => {
    const p = await runPlan({ stage: "started", personaId: "P1", preferences: { notes: "My chemo starts soon. I like a side part." } }, { sessionId: SID, now });
    expect(p.brief).toContain("Notes: I like a side part.");
    expect(p.brief).not.toMatch(/chemo/i);
  });
});

describe("consult agent, Gemini -> Groq -> rule-based (mocked models, recorded tool-call transcript)", () => {
  // Own photo (sampled colour, no sample person): the paid path, so try_on proposals are exercised.
  const req = { stage: "not_yet" as const, firstTreatmentDate: "2026-11-02", hairColour: "#706D6B", preferences: { notes: "Likes curls." } };

  it("Gemini answers: tools run, paid steps stay pending, unknown ids dropped, text linted", async () => {
    const gemini = mockModel();
    const groq = mockModel();
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", gemini), asPlanner("Groq", groq)] });
    expect(p.source).toBe("llm");
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.Gemini);
    expect(gemini.doGenerateCalls).toHaveLength(3);
    expect(groq.doGenerateCalls).toHaveLength(0);
    // shortlist tool asked for wraps
    expect(p.shortlist.some((id) => id.startsWith("H"))).toBe(true);
    // try_on: W99 is unknown; never more than 3; nothing ran
    expect(p.pendingApproval!.length).toBeLessThanOrEqual(3);
    expect(p.pendingApproval!.every((x) => p.shortlist.includes(x.itemId))).toBe(true);
    expect(p.unitsUsed).toBe(0);
    // draft_brief with the user's notes and the model's note
    expect(p.brief).toContain("Long soft curls, salt and pepper");
    expect(p.brief).toContain("Likes curls. Prefers a soft fringe.");
    // the medical sentence from the transcript was replaced
    expect(p.messages[2]).toBe(`${SAFE_LINE} Previews show style and colour, not cap fit, density or comfort.`);
    expect(p.messages[1]).toBe("Each try-on waits for your OK before anything runs.");
    // the timeline is computed locally
    expect(p.timeline[1]).toMatchObject({ date: "2026-10-26", label: "Order your wig by this date" });
    expectSafe(p);
    const call = gemini.doGenerateCalls[0];
    expect(call.tools!.map((t) => t.name).sort()).toEqual(["draft_brief", "shortlist", "try_on", "youcam_capabilities"]);
    expect(call.maxOutputTokens).toBe(2000);
  });

  it("sample person on the LLM path: try_on reports free saved previews, nothing pending, 0 units", async () => {
    const gemini = mockModel();
    const p = await runPlan({ stage: "gone", personaId: "P1" }, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", gemini)] });
    expect(p.source).toBe("llm");
    expect(p.pendingApproval).toEqual([]);
    expect(p.unitsUsed).toBe(0);
    const toolResults = JSON.stringify(gemini.doGenerateCalls[1].prompt);
    expect(toolResults).toContain("free saved previews");
  });

  it("Gemini rate limited (429 RESOURCE_EXHAUSTED) -> Groq answers, Gemini tried once", async () => {
    const gemini = failingModel(rateLimited());
    const groq = mockModel();
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", gemini), asPlanner("Groq", groq)] });
    expect(gemini.doGenerateCalls).toHaveLength(1);
    expect(groq.doGenerateCalls).toHaveLength(3);
    expect(p.source).toBe("llm");
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.Groq);
  });

  it("Gemini times out -> Groq", async () => {
    const p = await runPlan(req, { sessionId: SID, now, mcp, timeoutMs: 50, models: [asPlanner("Gemini", hangingModel()), asPlanner("Groq", mockModel())] });
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.Groq);
  });

  it("both fail -> rule-based plan with the plain line", async () => {
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", failingModel(rateLimited())), asPlanner("Groq", failingModel())] });
    expect(p.source).toBe("fallback");
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.fallback);
    expect(p.shortlist).toHaveLength(4);
    expect(p.pendingApproval).toHaveLength(3);
  });

  it("an empty answer counts as a failure", async () => {
    const empty = mockModel([{ content: [{ type: "text", text: "  " }], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }]);
    const p = await runPlan({ stage: "started" }, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", empty)] });
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

  it("without GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY answers with the rule-based plan", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    const r = await post({ stage: "not_yet", firstTreatmentDate: "", personaId: "P4", preferences: { wantsWraps: true } });
    expect(r.status).toBe(200);
    const p = (await r.json()) as PlanResponse;
    expect(p.source).toBe("fallback");
    expect(p.timeline.every((t) => t.date === undefined)).toBe(true);
    expect(p.pendingApproval!.every((x) => x.tool === "try_on" && x.units === 2)).toBe(true);
  });
});
