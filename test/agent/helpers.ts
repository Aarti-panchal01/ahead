import fs from "node:fs";
import path from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { PlannerModel } from "@/lib/agent/providers";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

export function transcriptSteps(): LanguageModelV3GenerateResult[] {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "llm-transcript.json"), "utf8"));
  return raw.steps.map((s: Omit<LanguageModelV3GenerateResult, "usage" | "warnings">) => ({ ...s, usage, warnings: [] }));
}

/** A mock model that replays the given steps in order. */
export function mockModel(steps: LanguageModelV3GenerateResult[] = transcriptSteps()) {
  let i = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const s = steps[Math.min(i, steps.length - 1)];
      i++;
      return s;
    },
  });
}

export function failingModel(err: unknown = new Error("overloaded")) {
  return new MockLanguageModelV3({ doGenerate: async () => { throw err; } });
}

/** Gemini's rate-limit answer: HTTP 429, RESOURCE_EXHAUSTED. */
export function rateLimited() {
  return new APICallError({
    message: "Resource has been exhausted (e.g. check quota).",
    url: "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent",
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }),
    isRetryable: true,
  });
}

/** Never answers; rejects when the agent's timeout aborts the call. */
export function hangingModel() {
  return new MockLanguageModelV3({
    doGenerate: (opts) => new Promise((_, reject) => {
      opts.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });
}

export const asPlanner = (name: PlannerModel["name"], model: MockLanguageModelV3): PlannerModel => ({ name, model });

interface Exchange { method: string; rpcMethod: string | null; status: number; contentType: string | null; sessionId: string | null; body: string }

/**
 * Replays the recorded MCP exchanges (initialize, tools/list) for the AI SDK MCP client.
 * JSON-RPC ids are rewritten to match the request. Records every request it sees.
 */
export function replayMcpFetch() {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "mcp-beauty-tools-list.json"), "utf8")) as { exchanges: Exchange[] };
  const seen: { method: string; rpcMethod: string | null; auth: string | null }[] = [];
  const fetchFn = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const h = new Headers(init?.headers);
    seen.push({ method, rpcMethod: body?.method ?? null, auth: h.get("authorization") });
    const ex = fx.exchanges.find((e) => e.method === method && e.rpcMethod === (body?.method ?? null));
    if (!ex) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    let text = ex.body;
    if (body && body.id !== undefined) text = text.replace(/"id":\s*\d+/, `"id":${JSON.stringify(body.id)}`);
    const headers: Record<string, string> = { "content-type": ex.contentType ?? "application/json" };
    if (ex.sessionId) headers["mcp-session-id"] = ex.sessionId;
    return new Response(ex.status === 202 ? null : text, { status: ex.status, headers });
  };
  return { fetch: fetchFn as typeof globalThis.fetch, seen };
}
