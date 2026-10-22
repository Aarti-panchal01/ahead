import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPlan, SYSTEM_PROMPT } from "@/lib/agent/agent";
import { describeFailure, resetWarnings, scrub, warnMissingKeys } from "@/lib/agent/log";
import { setStore } from "@/lib/store";
import { freshStore } from "../platform/helpers";
import { asPlanner, failingModel, hangingModel, mockModel } from "./helpers";

const SID = "sess_logging_01";
const now = new Date("2026-10-22T09:00:00Z");
const GOOGLE_KEY = "AIzaSyFAKEfakeFAKEfake1234567890abcd";
const GROQ_KEY = "gsk_fakeFAKEfakeFAKE1234567890";
const NOTES = "I like soft curls and a long side fringe please";

const apiError = (status: number, body: unknown, message: string) =>
  new APICallError({
    message,
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GOOGLE_KEY}`,
    requestBodyValues: { contents: [{ parts: [{ text: NOTES }] }], tools: [{ name: "try_on", args: { itemIds: ["W01"] } }] },
    statusCode: status,
    responseBody: JSON.stringify(body),
    isRetryable: status === 429,
  });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  freshStore();
  resetWarnings();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", GOOGLE_KEY);
  vi.stubEnv("GROQ_API_KEY", GROQ_KEY);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); vi.unstubAllEnvs(); setStore(null); });

const logged = () => warn.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

function expectNoSecrets(text: string) {
  expect(text).not.toContain(GOOGLE_KEY);
  expect(text).not.toContain(GROQ_KEY);
  expect(text).not.toMatch(/https?:\/\//);
  expect(text).not.toContain("soft curls");
  expect(text).not.toContain(SYSTEM_PROMPT.slice(0, 40));
  expect(text).not.toMatch(/itemIds|W01|#706D6B|requestBody|contents/);
}

describe("planner failure logging", () => {
  it("one sanitized warn per failed provider: name, model, class, HTTP status, provider code", async () => {
    const gemini = failingModel(apiError(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" } },
      `Resource has been exhausted for key ${GOOGLE_KEY}: "${NOTES}" see https://ai.google.dev/x?key=${GOOGLE_KEY}`));
    const p = await runPlan(
      { stage: "not_yet", hairColour: "#706D6B", preferences: { notes: NOTES } },
      { sessionId: SID, now, models: [asPlanner("Gemini", gemini), asPlanner("Groq", mockModel())] },
    );
    expect(p.messages.at(-1)).toBe("Planned with Groq.");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = logged();
    expect(line).toContain("[agent] planner provider failed");
    const f = JSON.parse(line.slice(line.indexOf("{")));
    expect(f).toMatchObject({ provider: "Gemini", model: gemini.modelId, error: "APICallError", status: 429, code: "RESOURCE_EXHAUSTED" });
    expect(f.message.length).toBeLessThanOrEqual(200);
    expectNoSecrets(line);
  });

  it("both fail: two warns, then the rule-based plan", async () => {
    await runPlan({ stage: "gone", hairColour: "#706D6B" }, {
      sessionId: SID, now, timeoutMs: 30,
      models: [asPlanner("Gemini", hangingModel()), asPlanner("Groq", failingModel(new Error(`401 Invalid API Key ${GROQ_KEY}`)))],
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(logged()).toContain('"provider":"Gemini"');
    expect(logged()).toContain('"provider":"Groq"');
    expectNoSecrets(logged());
  });

  it("reads Google and Groq error codes", () => {
    expect(describeFailure("Gemini", "m", apiError(404, { error: { code: 404, status: "NOT_FOUND" } }, "models/x is not found"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(describeFailure("Gemini", "m", apiError(400, [{ error: { code: 400, status: "INVALID_ARGUMENT" } }], "Invalid tools"))).toMatchObject({ status: 400, code: "INVALID_ARGUMENT" });
    expect(describeFailure("Groq", "m", apiError(429, { error: { code: "rate_limit_exceeded", type: "tokens" } }, "Rate limit"))).toMatchObject({ status: 429, code: "rate_limit_exceeded" });
    const wrapped = Object.assign(new Error("Failed after 1 attempts"), { name: "AI_RetryError", lastError: apiError(503, { error: { status: "UNAVAILABLE" } }, "overloaded") });
    expect(describeFailure("Gemini", "m", wrapped)).toMatchObject({ error: "APICallError", status: 503, code: "UNAVAILABLE" });
  });

  it("scrub removes keys, env secrets, URLs and long quoted text, and trims to 200", () => {
    const s = scrub(`bad ${GOOGLE_KEY} ${GROQ_KEY} Bearer abc.def https://x.y/z?key=1 "${NOTES}" ${"x".repeat(300)}`);
    expect(s).not.toContain(GOOGLE_KEY);
    expect(s).not.toContain(GROQ_KEY);
    expect(s).not.toContain("abc.def");
    expect(s).not.toContain("x.y/z");
    expect(s).not.toContain("soft curls");
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it("missing keys: names only, once per instance", () => {
    warnMissingKeys({ GROQ_API_KEY: GROQ_KEY });
    warnMissingKeys({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()).toBe("[agent] planner provider skipped, env not set: GOOGLE_GENERATIVE_AI_API_KEY");
  });
});
