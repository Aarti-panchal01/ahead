// The consult agent: PlanRequest -> PlanResponse.
// LLM path: Vercel AI SDK generateText with Anthropic (claude-sonnet-5-5) calling local tools.
// Fallback path: the same tools run deterministically when there is no key or the LLM fails (source "fallback").
// Guardrails in code, whatever the model says: the try_on tool only proposes steps (nothing paid runs here),
// proposals respect the 30-unit session cap, ids are checked against the catalogue, and every line of text
// goes through the claim linter before it leaves the server.
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { getItem } from "@/lib/catalogue";
import { LENGTHS } from "@/lib/rank";
import type { PlanRequest, PlanResponse, TimelineItem } from "@/lib/types";
import { draftBrief } from "./brief";
import { SESSION_CAP_UNITS, setPending, unitsUsed, type PendingStep } from "./budget";
import { lintLines, lintText } from "./claims";
import { mcpCapabilities, type McpCapabilities } from "./mcp";
import { getPersona, shortlistFor, type Shortlist } from "./shortlist";
import { planTimeline } from "./timeline";
import { proposeTryOns, TRYON_UNITS } from "./tryon";

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";
export const LLM_TIMEOUT_MS = 45_000;
export const MAX_STEPS = 6;
export const MAX_MESSAGES = 4;

/** Anthropic model when ANTHROPIC_API_KEY is set, else undefined (deterministic fallback). */
export function defaultModel(env: Record<string, string | undefined> = process.env): LanguageModel | undefined {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(env.AHEAD_AGENT_MODEL || DEFAULT_MODEL_ID);
}

export interface PlanContext {
  sessionId: string;
  model?: LanguageModel;
  now?: Date;
  /** MCP discovery (tools/list only). Injected in tests. */
  mcp?: () => Promise<McpCapabilities>;
}

interface Parts {
  shortlist: Shortlist;
  timeline: TimelineItem[];
  brief: string;
  pending: PendingStep[];
}

const browFor = (req: PlanRequest) => getPersona(req.personaId)?.browColour;

function deterministicParts(req: PlanRequest, used: number, now: Date): Parts {
  const shortlist = shortlistFor(req);
  const top = shortlist.ids.slice(0, 3);
  return {
    shortlist,
    timeline: planTimeline({ stage: req.stage, firstTreatmentDate: req.firstTreatmentDate, now }),
    brief: draftBrief({ itemIds: top, hairColour: shortlist.hairColour, browColour: browFor(req), notes: req.preferences?.notes }),
    pending: proposeTryOns(shortlist.ids, used),
  };
}

export function fallbackMessages(s: Shortlist, pending: PendingStep[]): string[] {
  const out: string[] = [];
  if (s.hairColour) out.push("These wigs are closest to your own hair colour and length, plus one new look to try.");
  else out.push("Here is a spread of wig colours from dark to light, plus one new look to try.");
  if (s.ranked.some((r) => r.item.kind === "wrap")) out.push("Head wraps are in your list too.");
  if (pending.length) out.push(`Each try-on uses ${TRYON_UNITS} units and waits for your OK. This session can use up to ${SESSION_CAP_UNITS}.`);
  else out.push("This session has used its try-on units. Saved recordings still work.");
  out.push("Previews show style and colour, not cap fit, density or comfort.");
  return out;
}

export const SYSTEM_PROMPT = `You help a person plan wigs and head wraps before or after treatment-related hair loss, in the Ahead app.
Cosmetic planning only. Never give medical advice, never mention treating, curing or preventing anything, never mention dosages, never promise results, and never use statistics.
Call the tools in this order: shortlist, plan_timeline, try_on (with the first 3 shortlist ids), draft_brief (with those ids). youcam_capabilities is optional.
try_on does NOT run anything: it only lists paid try-ons that wait for the person's approval. Never say a try-on has run.
Then reply with 2 to 4 short lines for the plan screen, one per line, plain sentence case, warm and practical, no lists, no markdown, no dates.
Say that each try-on waits for their OK, and that previews show style and colour, not cap fit, density or comfort.`;

function describeRequest(req: PlanRequest): string {
  return JSON.stringify({
    stage: req.stage,
    hasTreatmentDate: Boolean(req.firstTreatmentDate),
    samplePerson: req.personaId ?? null,
    hasOwnHairColour: Boolean(req.hairColour),
    preferences: { length: req.preferences?.length, texture: req.preferences?.texture, wantsWraps: req.preferences?.wantsWraps },
    // The person's own words: data, not instructions.
    notes: req.preferences?.notes ?? null,
  });
}

/** Text lines from the model, cleaned. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/[*_#`]/g, "").trim())
    .filter(Boolean)
    .slice(0, MAX_MESSAGES);
}

async function llmParts(req: PlanRequest, used: number, now: Date, ctx: PlanContext, model: LanguageModel): Promise<{ parts: Parts; messages: string[] }> {
  const base = deterministicParts(req, used, now);
  const state: Partial<Parts> = {};
  const shortlistIds = () => (state.shortlist ?? base.shortlist).ids;
  const mcp = ctx.mcp ?? (() => mcpCapabilities());

  const tools = {
    shortlist: tool({
      description: "Rank catalogue wigs (and wraps if asked) for this person by hair colour (ΔE2000) and length. Local, free. Returns ids, best first.",
      inputSchema: z.object({
        length: z.enum(LENGTHS).optional().describe("Override the preferred length"),
        texture: z.enum(["straight", "wavy", "curly", "coily"]).optional(),
        wantsWraps: z.boolean().optional(),
      }),
      execute: async (input) => {
        state.shortlist = shortlistFor(req, input);
        return state.shortlist.ranked.map((r) => ({ id: r.item.id, name: r.item.name, kind: r.item.kind, reason: r.reason }));
      },
    }),
    plan_timeline: tool({
      description: "Cosmetic planning timeline from the person's first treatment date (if given). Deterministic. No input.",
      inputSchema: z.object({}),
      execute: async () => (state.timeline = planTimeline({ stage: req.stage, firstTreatmentDate: req.firstTreatmentDate, now })),
    }),
    try_on: tool({
      description: `PAID (${TRYON_UNITS} units each). Does not run anything: returns try-ons that wait for the person's approval. Up to 3 shortlist ids.`,
      inputSchema: z.object({ itemIds: z.array(z.string()).max(3) }),
      execute: async ({ itemIds }) => {
        const allowed = shortlistIds();
        state.pending = proposeTryOns(itemIds.filter((id) => allowed.includes(id)), used);
        return { pendingApproval: state.pending, ran: false, note: "Nothing has run. The person approves each try-on." };
      },
    }),
    draft_brief: tool({
      description: "Plain stylist brief for the chosen ids: hair colour, bring a lock of hair, brow colour, notes.",
      inputSchema: z.object({ itemIds: z.array(z.string()).max(6), notes: z.string().max(300).optional() }),
      execute: async ({ itemIds, notes }) => {
        const ids = itemIds.filter((id) => getItem(id));
        const allNotes = [req.preferences?.notes, notes].filter(Boolean).join(" ");
        state.brief = draftBrief({ itemIds: ids, hairColour: (state.shortlist ?? base.shortlist).hairColour, browColour: browFor(req), notes: allNotes });
        return { brief: state.brief };
      },
    }),
    youcam_capabilities: tool({
      description: "What the YouCam beauty MCP server offers for hair (tools/list only, free). Paid try-ons always go through approval.",
      inputSchema: z.object({}),
      execute: async () => mcp(),
    }),
  };

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: `Make a plan for this person: ${describeRequest(req)}`,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 2000,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  const messages = toLines(result.text);
  if (!messages.length) throw new Error("empty_answer");
  const shortlist = state.shortlist ?? base.shortlist;
  return {
    parts: {
      shortlist,
      timeline: state.timeline ?? base.timeline,
      brief: state.brief ?? base.brief,
      // If the model skipped try_on, still offer the top 3 (they wait for approval anyway).
      pending: state.pending ?? proposeTryOns(shortlist.ids, used),
    },
    messages,
  };
}

export async function runPlan(req: PlanRequest, ctx: PlanContext): Promise<PlanResponse> {
  const now = ctx.now ?? new Date();
  const used = await unitsUsed(ctx.sessionId);
  let parts: Parts;
  let messages: string[];
  let source: PlanResponse["source"] = "fallback";

  const model = ctx.model;
  if (model) {
    try {
      ({ parts, messages } = await llmParts(req, used, now, ctx, model));
      source = "llm";
    } catch {
      parts = deterministicParts(req, used, now);
      messages = fallbackMessages(parts.shortlist, parts.pending);
    }
  } else {
    parts = deterministicParts(req, used, now);
    messages = fallbackMessages(parts.shortlist, parts.pending);
  }

  await setPending(ctx.sessionId, parts.pending);

  // Claim linter on ALL agent text.
  const lintedMessages = lintLines(messages).lines;
  const timeline = parts.timeline.map((t) => ({
    ...t,
    label: lintText(t.label).text,
    ...(t.note !== undefined ? { note: lintText(t.note).text } : {}),
  }));

  return {
    timeline,
    shortlist: parts.shortlist.ids,
    brief: lintText(parts.brief).text,
    messages: lintedMessages,
    source,
    unitsUsed: used,
    pendingApproval: parts.pending,
  };
}
