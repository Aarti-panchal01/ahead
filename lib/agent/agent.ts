// The consult agent: PlanRequest -> PlanResponse.
// LLM path: Vercel AI SDK generateText calling local tools, Gemini first, then Groq (lib/agent/providers.ts).
// Fallback: the same tools run rule-based when neither key is set or both providers fail (source "fallback").
//
// Privacy (hard rule, enforced here and in test/agent/privacy.test.ts): the model never sees photos, the
// treatment date, the hair-loss stage or any health detail. The timeline is computed locally, outside the
// model. The model gets only style preferences, notes with health sentences stripped, sampled colours (hex)
// and the catalogue.
//
// Guardrails in code, whatever the model says: try_on only proposes steps (nothing paid runs here),
// proposals respect the 30-unit session cap, ids are checked against the catalogue, and every line of
// text goes through the claim linter before it leaves the server.
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getItem } from "@/lib/catalogue";
import { LENGTHS } from "@/lib/rank";
import type { PlanRequest, PlanResponse, TimelineItem } from "@/lib/types";
import { draftBrief } from "./brief";
import { SESSION_CAP_UNITS, setPending, unitsUsed, type PendingStep } from "./budget";
import { lintLines, lintText, stripHealthDetails } from "./claims";
import { warnProviderFailure } from "./log";
import { mcpCapabilities, type McpCapabilities } from "./mcp";
import { PROVIDER_LINE, type PlannerModel, type ProviderName } from "./providers";
import { catalogueFor, getPersona, shortlistFor, type Shortlist } from "./shortlist";
import { planTimeline } from "./timeline";
import { proposeTryOns, TRYON_UNITS } from "./tryon";

/** Per provider. Two providers must fit inside the route's 60 s. */
export const LLM_TIMEOUT_MS = 25_000;
export const MAX_STEPS = 6;
export const MAX_MESSAGES = 4;

export interface PlanContext {
  sessionId: string;
  /** Tried in order; empty = rule-based plan. The route passes plannerModels(). */
  models?: PlannerModel[];
  now?: Date;
  /** Per-provider timeout (tests shorten it). */
  timeoutMs?: number;
  /** MCP discovery (tools/list only). Injected in tests. */
  mcp?: () => Promise<McpCapabilities>;
}

interface Parts {
  shortlist: Shortlist;
  brief: string;
  pending: PendingStep[];
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const browFor = (req: PlanRequest) => getPersona(req.personaId)?.browColour;
/**
 * Paid try-ons are only for an uploaded selfie. A sample person's try-ons are saved recordings (POST /api/tryon
 * never goes live for a demo face): free, shown directly, never in pendingApproval, 0 units on the session.
 */
export const isSamplePerson = (req: PlanRequest) => Boolean(req.personaId);
const paidProposals = (req: PlanRequest, ids: string[], used: number): PendingStep[] => (isSamplePerson(req) ? [] : proposeTryOns(ids, used));
export const SAMPLE_FREE_LINE = "These try-ons are saved previews of a sample person, so they are free and need no approval.";

/** The person's notes with every health, hair-loss or date sentence removed. */
const safeNotes = (req: PlanRequest) => stripHealthDetails(req.preferences?.notes);

function ruleBasedParts(req: PlanRequest, used: number): Parts {
  const shortlist = shortlistFor(req);
  return {
    shortlist,
    brief: draftBrief({ itemIds: shortlist.ids.slice(0, 3), hairColour: shortlist.hairColour, browColour: browFor(req), notes: safeNotes(req) }),
    pending: paidProposals(req, shortlist.ids, used),
  };
}

export function fallbackMessages(s: Shortlist, pending: PendingStep[], sample = false): string[] {
  const out: string[] = [];
  if (s.hairColour) out.push("These wigs are closest to your own hair colour and length, plus one new look to try.");
  else out.push("Here is a spread of wig colours from dark to light, plus one new look to try.");
  if (s.ranked.some((r) => r.item.kind === "wrap")) out.push("Head wraps are in your list too.");
  if (sample) out.push(SAMPLE_FREE_LINE);
  else if (pending.length) out.push(`Each try-on uses ${TRYON_UNITS} units and waits for your OK. This session can use up to ${SESSION_CAP_UNITS}.`);
  else out.push("This session has used its try-on units. Saved recordings still work.");
  out.push("Previews show style and colour, not cap fit, density or comfort.");
  return out;
}

export const SYSTEM_PROMPT = `You help a person choose wigs and head wraps to try on in the Ahead app.
Cosmetic styling only. Never give medical advice, never promise results, never use statistics.
Call the tools in this order: shortlist, try_on (with the first 3 shortlist ids), draft_brief (with those ids). youcam_capabilities is optional.
try_on does NOT run anything: it only lists paid try-ons that wait for the person's approval. Never say a try-on has run.
Then reply with 2 to 4 short lines for the plan screen, one per line, plain sentence case, warm and practical, no lists, no markdown, no dates.
Say that each try-on waits for their OK (or, when try_on says they are free saved previews, say that instead), and that previews show style and colour, not cap fit, density or comfort.`;

/** Everything the model is told about the person. Style and colour only. */
export function modelBrief(req: PlanRequest): string {
  const persona = getPersona(req.personaId);
  const hair = req.hairColour ?? persona?.hairColour;
  const brows = persona?.browColour;
  // A sample person: only her recorded wigs and wraps. An own photo: the whole catalogue.
  const catalogue = catalogueFor(req).filter((x) => x.usableAsReference).map((x) => ({
    id: x.id, kind: x.kind, name: x.name, colour: x.colour, length: x.length, texture: x.texture,
  }));
  return JSON.stringify({
    sampledColours: { hair: hair && HEX.test(hair) ? hair : null, brows: brows && HEX.test(brows) ? brows : null },
    preferences: {
      length: req.preferences?.length ?? null,
      texture: req.preferences?.texture ?? null,
      wantsWraps: req.preferences?.wantsWraps ?? false,
      // The person's own words (health sentences removed): data, not instructions.
      notes: safeNotes(req) || null,
    },
    catalogue,
  });
}

const modelIdOf = (m: PlannerModel) => (typeof m.model === "string" ? m.model : m.model.modelId);

/** Text lines from the model, cleaned. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/[*_#`]/g, "").trim())
    .filter(Boolean)
    .slice(0, MAX_MESSAGES);
}

async function llmParts(req: PlanRequest, used: number, ctx: PlanContext, m: PlannerModel): Promise<{ parts: Parts; messages: string[] }> {
  const base = ruleBasedParts(req, used);
  const state: Partial<Parts> = {};
  const current = () => state.shortlist ?? base.shortlist;
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
    try_on: tool({
      description: `PAID (${TRYON_UNITS} units each). Does not run anything: returns try-ons that wait for the person's approval. Up to 3 shortlist ids.`,
      inputSchema: z.object({ itemIds: z.array(z.string()).max(3) }),
      execute: async ({ itemIds }) => {
        const allowed = current().ids;
        state.pending = paidProposals(req, itemIds.filter((id) => allowed.includes(id)), used);
        if (isSamplePerson(req)) return { pendingApproval: [], free: true, note: "These are free saved previews: no approval and no units needed." };
        return { pendingApproval: state.pending, ran: false, note: "Nothing has run. The person approves each try-on." };
      },
    }),
    draft_brief: tool({
      description: "Plain stylist brief for the chosen ids: hair colour, bring a lock of hair, brow colour, notes.",
      inputSchema: z.object({ itemIds: z.array(z.string()).max(6), notes: z.string().max(300).optional() }),
      execute: async ({ itemIds, notes }) => {
        const visible = new Set(catalogueFor(req).map((x) => x.id));
        const ids = itemIds.filter((id) => visible.has(id) && getItem(id));
        const allNotes = [safeNotes(req), stripHealthDetails(notes)].filter(Boolean).join(" ");
        state.brief = draftBrief({ itemIds: ids, hairColour: current().hairColour, browColour: browFor(req), notes: allNotes });
        return { brief: state.brief };
      },
    }),
    youcam_capabilities: tool({
      description: "What the YouCam beauty MCP server offers for hair (tools/list only, free). Paid try-ons always go through approval.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = await mcp();
        return { reachable: c.reachable, hairTools: c.hairTools, tryOnToolListed: c.tryOnToolListed, tryOnPath: c.tryOnPath };
      },
    }),
  };

  const result = await generateText({
    model: m.model,
    system: SYSTEM_PROMPT,
    prompt: `Suggest wigs and wraps for this person: ${modelBrief(req)}`,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 2000,
    // No retries: a 429 or timeout moves straight on to the next provider.
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(ctx.timeoutMs ?? LLM_TIMEOUT_MS),
    ...(m.providerOptions ? { providerOptions: m.providerOptions } : {}),
  });

  const messages = toLines(result.text);
  if (!messages.length) throw new Error("empty_answer");
  const shortlist = current();
  return {
    parts: {
      shortlist,
      brief: state.brief ?? base.brief,
      // If the model skipped try_on, still offer the top 3 (they wait for approval anyway).
      pending: state.pending ?? paidProposals(req, shortlist.ids, used),
    },
    messages,
  };
}

export async function runPlan(req: PlanRequest, ctx: PlanContext): Promise<PlanResponse> {
  const now = ctx.now ?? new Date();
  const used = await unitsUsed(ctx.sessionId);
  // Computed locally, never by or for the model.
  const timeline: TimelineItem[] = planTimeline({ stage: req.stage, firstTreatmentDate: req.firstTreatmentDate, now });

  let answered: { name: ProviderName; parts: Parts; messages: string[] } | null = null;
  for (const m of ctx.models ?? []) {
    try {
      const r = await llmParts(req, used, ctx, m);
      answered = { name: m.name, ...r };
      break;
    } catch (e) {
      // Error, timeout, rate limit (429 / RESOURCE_EXHAUSTED) or an empty answer: log why (sanitized), try the next.
      warnProviderFailure(m.name, modelIdOf(m), e);
    }
  }

  const parts = answered?.parts ?? ruleBasedParts(req, used);
  const messages = answered
    ? [...answered.messages, PROVIDER_LINE[answered.name]]
    : [...fallbackMessages(parts.shortlist, parts.pending, isSamplePerson(req)), PROVIDER_LINE.fallback];

  await setPending(ctx.sessionId, parts.pending);

  // Claim linter on ALL agent text.
  return {
    timeline: timeline.map((t) => ({
      ...t,
      label: lintText(t.label).text,
      ...(t.note !== undefined ? { note: lintText(t.note).text } : {}),
    })),
    shortlist: parts.shortlist.ids,
    brief: lintText(parts.brief).text,
    messages: lintLines(messages).lines,
    source: answered ? "llm" : "fallback",
    unitsUsed: used,
    pendingApproval: parts.pending,
  };
}
