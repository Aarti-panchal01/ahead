// Sanitized logging for planner (LLM provider) failures, one console.warn per failure, so Vercel logs show WHY a
// provider failed. Never logs keys, the prompt, messages, tool arguments, response bodies or URLs.
import { APICallError } from "ai";

export interface ProviderFailure {
  provider: string;
  model: string;
  /** Error class or name, e.g. APICallError, TimeoutError, AbortError, Error. */
  error: string;
  /** HTTP status when the provider answered, e.g. 429, 404, 400. */
  status?: number;
  /** Provider error code or status text, e.g. RESOURCE_EXHAUSTED, NOT_FOUND, INVALID_ARGUMENT, rate_limit_exceeded. */
  code?: string;
  /** Short, scrubbed message (max 200 chars). */
  message: string;
}

const MAX_MESSAGE = 200;
const SECRET_ENV = ["GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY", "YOUCAM_API_KEY", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"];

/** Removes URLs, anything key-shaped, the values of secret env vars, and quoted text (may echo input). */
export function scrub(text: string, env: Record<string, string | undefined> = process.env): string {
  let t = text;
  for (const name of SECRET_ENV) {
    const v = env[name];
    if (v && v.length >= 6) t = t.split(v).join("[redacted]");
  }
  t = t
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:AIza[0-9A-Za-z_-]{10,}|gsk_[0-9A-Za-z]{10,}|sk-[0-9A-Za-z_-]{10,}|Bearer\s+\S+)/g, "[redacted]")
    .replace(/\b[0-9A-Za-z_-]{32,}\b/g, "[redacted]")
    .replace(/"[^"]{25,}"|'[^']{25,}'/g, "[text]")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > MAX_MESSAGE ? `${t.slice(0, MAX_MESSAGE - 1)}…` : t;
}

/** Reads only the provider's error code/status from a JSON error body (Google: error.status; Groq/OpenAI: error.code or type). */
function providerCode(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const j = JSON.parse(body) as { error?: { status?: unknown; code?: unknown; type?: unknown } } | Array<{ error?: { status?: unknown } }>;
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    const c = (e as { status?: unknown })?.status ?? (e as { code?: unknown })?.code ?? (e as { type?: unknown })?.type;
    return typeof c === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(c) ? c : undefined;
  } catch {
    const m = body.match(/\b[A-Z][A-Z_]{5,40}\b/);
    return m?.[0];
  }
}

/** The error behind an AI SDK wrapper (RetryError keeps the last one in lastError). */
function innermost(e: unknown): unknown {
  let cur = e;
  for (let i = 0; i < 4; i++) {
    const next = (cur as { lastError?: unknown; cause?: unknown } | null)?.lastError ?? (cur as { cause?: unknown } | null)?.cause;
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

export function describeFailure(provider: string, model: string, e: unknown): ProviderFailure {
  const inner = innermost(e);
  const err = inner instanceof Error ? inner : new Error(String(inner));
  const out: ProviderFailure = { provider, model, error: err.name || "Error", message: scrub(err.message || "") };
  if (APICallError.isInstance(inner)) {
    out.error = "APICallError";
    if (inner.statusCode) out.status = inner.statusCode;
    const code = providerCode(inner.responseBody);
    if (code) out.code = code;
  }
  return out;
}

/** One console.warn line per provider failure. */
export function warnProviderFailure(provider: string, model: string, e: unknown): ProviderFailure {
  const f = describeFailure(provider, model, e);
  console.warn(`[agent] planner provider failed ${JSON.stringify(f)}`);
  return f;
}

let warnedMissing = false;
/** Once per server instance: say which planner keys are missing (names only), so "Planned with Groq" is explainable. */
export function warnMissingKeys(env: Record<string, string | undefined> = process.env) {
  if (warnedMissing) return;
  const missing = ["GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY"].filter((k) => !env[k]);
  if (missing.length) console.warn(`[agent] planner provider skipped, env not set: ${missing.join(", ")}`);
  warnedMissing = true;
}
/** Tests. */
export function resetWarnings() { warnedMissing = false; }
