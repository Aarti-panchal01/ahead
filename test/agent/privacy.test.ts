// Hard rule: no photo, treatment date, hair-loss stage or health detail ever reaches a language model.
// These tests read the exact prompt, messages, tool definitions and tool results sent to the mocked models.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MockLanguageModelV3 } from "ai/test";
import { modelBrief, runPlan, SYSTEM_PROMPT } from "@/lib/agent/agent";
import { stripHealthDetails } from "@/lib/agent/claims";
import type { McpCapabilities } from "@/lib/agent/mcp";
import { setStore } from "@/lib/store";
import type { HairLossStage, PlanRequest } from "@/lib/types";
import { freshStore } from "../platform/helpers";
import { asPlanner, failingModel, mockModel, rateLimited } from "./helpers";

const SID = "sess_privacy_01";
const now = new Date("2026-10-22T09:00:00Z");
const mcp = async (): Promise<McpCapabilities> => ({ reachable: true, toolCount: 50, hairTools: ["AI-Hair-Style-Virtual-Try-On"], tryOnToolListed: true, tryOnPath: "rest" });

const FORBIDDEN: RegExp[] = [
  /2026-11-02/, /11\/02|02\/11|nov(?:ember)?\s*2/i, // the treatment date in any form
  /firstTreatmentDate/i, /"stage"/i, /\bnot_yet\b/, /\bstarted\b/i, /\bgone\b/i, // the stage
  /chemo/i, /cancer/i, /treatment/i, /radiation/i, /radiotherapy/i, /oncolog/i, /hair\s*loss/i, /bald/i, /diagnos/i,
  /\.jpg|\.png|data:image|base64|\/personas\//i, // photos
];

/** Everything a model was sent: system + prompt messages (incl. tool results) + tool definitions. */
function sentTo(model: MockLanguageModelV3): string {
  return model.doGenerateCalls.map((c) => JSON.stringify({ prompt: c.prompt, tools: c.tools })).join("\n");
}

function expectClean(text: string) {
  for (const re of FORBIDDEN) expect(text, `model input matched ${re}`).not.toMatch(re);
}

const NOTES = "I start chemo on 2026-11-02. I like soft curls. My cancer treatment makes me tired. Radiation next week. My hair loss started already.";

beforeEach(() => { freshStore(); });
afterEach(() => setStore(null));

describe("privacy: what the model sees", () => {
  it.each<HairLossStage>(["not_yet", "started", "gone"])("stage %s + a date + health notes: none of it reaches Gemini", async (stage) => {
    const gemini = mockModel();
    const req: PlanRequest = { stage, firstTreatmentDate: "2026-11-02", personaId: "P1", preferences: { length: "long", texture: "curly", wantsWraps: true, notes: NOTES } };
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Gemini", gemini)] });
    expect(p.source).toBe("llm");
    expect(gemini.doGenerateCalls.length).toBeGreaterThan(1);
    const sent = sentTo(gemini);
    expectClean(sent);
    // What it does get: style preferences, cleaned notes, sampled colours, the catalogue.
    expect(sent).toContain("I like soft curls.");
    expect(sent).toContain("#706D6B");
    expect(sent).toContain("W01");
    // The timeline still uses the date: computed locally.
    if (stage === "not_yet") expect(p.timeline.some((t) => t.date === "2026-10-26")).toBe(true);
    else expect(p.timeline[0].date).toBe("2026-10-22");
  });

  it("the Groq fallback gets the same clean input", async () => {
    const groq = mockModel();
    await runPlan(
      { stage: "started", firstTreatmentDate: "2026-11-02", hairColour: "#3A2A22", preferences: { notes: NOTES } },
      { sessionId: SID, now, mcp, models: [asPlanner("Gemini", failingModel(rateLimited())), asPlanner("Groq", groq)] },
    );
    const sent = sentTo(groq);
    expectClean(sent);
    expect(sent).toContain("#3A2A22");
  });

  it("the system prompt and the brief sent to the model are clean on their own", () => {
    expectClean(SYSTEM_PROMPT);
    expectClean(modelBrief({ stage: "gone", firstTreatmentDate: "2026-11-02", personaId: "P3", preferences: { notes: NOTES } }));
  });

  it("stripHealthDetails removes health, hair-loss and date sentences and keeps style ones", () => {
    expect(stripHealthDetails(NOTES)).toBe("I like soft curls.");
    expect(stripHealthDetails("Short and sleek please. Treatment is on 3 Nov. Next week I see my oncologist.")).toBe("Short and sleek please.");
    expect(stripHealthDetails("I wear glasses. Warm brown tones.")).toBe("I wear glasses. Warm brown tones.");
    expect(stripHealthDetails(undefined)).toBe("");
  });
});
