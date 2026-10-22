// Production bug: gpt-oss on Groq sends null (or omits) optional tool fields; the schema must accept both.
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPlan } from "@/lib/agent/agent";
import { findClaims } from "@/lib/agent/claims";
import type { McpCapabilities } from "@/lib/agent/mcp";
import { PROVIDER_LINE } from "@/lib/agent/providers";
import { setStore } from "@/lib/store";
import { freshStore } from "../platform/helpers";
import { asPlanner, mockModel } from "./helpers";

const SID = "sess_toolinput_1";
const now = new Date("2026-10-23T09:00:00Z");
const mcp = async (): Promise<McpCapabilities> => ({ reachable: true, toolCount: 50, hairTools: [], tryOnToolListed: true, tryOnPath: "rest" });
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function transcript(args: { shortlist: unknown; try_on: unknown; draft_brief: unknown }): LanguageModelV3GenerateResult[] {
  const call = (id: string, toolName: string, input: unknown) => ({ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) });
  return [
    { content: [call("c1", "shortlist", args.shortlist)], finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage, warnings: [] },
    { content: [call("c2", "try_on", args.try_on), call("c3", "draft_brief", args.draft_brief)], finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage, warnings: [] },
    { content: [{ type: "text", text: "Here are wigs close to your colour.\nEach try-on waits for your OK." }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] },
  ];
}

/** Every tool result the model got back (the last prompt holds the whole history). */
function toolOutputs(model: ReturnType<typeof mockModel>): { toolName: string; output: { type: string } }[] {
  return model.doGenerateCalls.slice(-1).flatMap((c) =>
    c.prompt.flatMap((m) => (m.role === "tool" ? m.content.filter((p) => p.type === "tool-result") : [])),
  ) as unknown as { toolName: string; output: { type: string } }[];
}

beforeEach(() => { freshStore(); });
afterEach(() => setStore(null));

describe("tool inputs: null and omitted optional fields", () => {
  const req = { stage: "not_yet" as const, hairColour: "#706D6B", preferences: { notes: "Likes curls. My chemo starts 2026-11-03." } };

  it("Groq sends length: null, texture: null (and nulls elsewhere): the tools run and Groq plans", async () => {
    const groq = mockModel(transcript({
      shortlist: { length: null, texture: null, wantsWraps: null },
      try_on: { itemIds: ["W01", "W02", "W03", "W99", "W04"] },
      draft_brief: { itemIds: ["W01"], notes: null },
    }));
    const gemini = mockModel();
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Groq", groq), asPlanner("Gemini", gemini)] });
    expect(p.source).toBe("llm");
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.Groq);
    expect(gemini.doGenerateCalls).toHaveLength(0);
    const outs = toolOutputs(groq);
    expect(outs.map((o) => o.toolName).sort()).toEqual(["draft_brief", "shortlist", "try_on"]);
    expect(outs.every((o) => !o.output.type.startsWith("error"))).toBe(true);
    // try_on: capped at 3, unknown ids dropped, nothing ran.
    expect(p.pendingApproval!.length).toBeLessThanOrEqual(3);
    expect(p.pendingApproval!.every((x) => p.shortlist.includes(x.itemId))).toBe(true);
    expect(p.unitsUsed).toBe(0);
    // The brief keeps the cleaned notes only (privacy unchanged).
    expect(p.brief).toContain("Notes: Likes curls.");
    expect(p.brief).not.toMatch(/chemo|2026-11-03/i);
    expect(findClaims(p.messages.join("\n"))).toEqual([]);
  });

  it("omitted optional fields also work", async () => {
    const groq = mockModel(transcript({ shortlist: {}, try_on: {}, draft_brief: {} }));
    const p = await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Groq", groq)] });
    expect(p.messages.at(-1)).toBe(PROVIDER_LINE.Groq);
    expect(toolOutputs(groq).every((o) => !o.output.type.startsWith("error"))).toBe(true);
    expect(p.shortlist.length).toBeGreaterThan(0);
    expect(p.brief).toMatch(/bring a lock of hair/);
  });

  it("the JSON schema sent to the provider allows null for every optional field", async () => {
    const groq = mockModel(transcript({ shortlist: {}, try_on: {}, draft_brief: {} }));
    await runPlan(req, { sessionId: SID, now, mcp, models: [asPlanner("Groq", groq)] });
    const tools = groq.doGenerateCalls[0].tools!;
    const props = (name: string) =>
      (tools.find((t) => t.name === name) as unknown as { inputSchema: { properties: Record<string, unknown>; required?: string[] } }).inputSchema;
    for (const [name, fields] of [["shortlist", ["length", "texture", "wantsWraps"]], ["try_on", ["itemIds"]], ["draft_brief", ["itemIds", "notes"]]] as const) {
      const schema = props(name);
      expect(schema.required ?? []).toEqual([]);
      for (const f of fields) expect(JSON.stringify(schema.properties[f]), `${name}.${f}`).toContain('"null"');
    }
  });
});
