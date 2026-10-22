// Language models for the consult agent, tried in order: Gemini, then Groq, then the rule-based planner.
// Keys are server-side env vars only. A provider without a key is skipped.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/**
 * Gemini 3.8 Flash: the current stable Flash model, on the free tier, function calling supported.
 * Sources (checked 22 Oct 2026): https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
 * (Function calling: Supported), https://ai.google.dev/gemini-api/docs/pricing (free tier: "Free of charge"),
 * https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai (Tool Usage ✓).
 */
export const GEMINI_MODEL_ID = "gemini-3.8-flash";

/**
 * GPT-OSS 120B on Groq: a production model (not preview) with tool use.
 * Sources (checked 22 Oct 2026): https://console.groq.com/docs/models (Production models),
 * https://console.groq.com/docs/tool-use ("All models hosted on Groq support tool use"; no parallel tool calls
 * for gpt-oss, which this agent does not need), https://ai-sdk.dev/providers/ai-sdk-providers/groq (Tool Usage ✓).
 */
export const GROQ_MODEL_ID = "openai/gpt-oss-120b";

export type ProviderName = "Gemini" | "Groq";

export interface PlannerModel {
  name: ProviderName;
  model: LanguageModel;
  /** Provider options for generateText (kept small: low thinking keeps the plan fast). */
  providerOptions?: Record<string, Record<string, string | number | boolean | Record<string, string>>>;
}

export function plannerModels(env: Record<string, string | undefined> = process.env): PlannerModel[] {
  const out: PlannerModel[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    out.push({
      name: "Gemini",
      model: createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(GEMINI_MODEL_ID),
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    });
  }
  if (env.GROQ_API_KEY) out.push({ name: "Groq", model: createGroq({ apiKey: env.GROQ_API_KEY })(GROQ_MODEL_ID) });
  return out;
}

export const PROVIDER_LINE: Record<ProviderName | "fallback", string> = {
  Gemini: "Planned with Gemini.",
  Groq: "Planned with Groq.",
  fallback: "We used our simple planner because the AI planner was unavailable.",
};
