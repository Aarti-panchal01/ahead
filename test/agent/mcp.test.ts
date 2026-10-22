import { afterEach, describe, expect, it } from "vitest";
import { listMcpTools, MCP_TRYON_TOOL, mcpCapabilities, resetMcpCache, summarise } from "@/lib/agent/mcp";
import { replayMcpFetch } from "./helpers";

afterEach(() => resetMcpCache());

describe("YouCam beauty MCP (recorded tools/list, 22 Oct)", () => {
  it("lists the 50 recorded tools through the AI SDK MCP client, with the bearer key, and never calls a tool", async () => {
    const { fetch, seen } = replayMcpFetch();
    const tools = await listMcpTools({ apiKey: "test-key", fetch });
    expect(tools).toHaveLength(50);
    expect(tools.map((t) => t.name)).toContain(MCP_TRYON_TOOL);
    expect(seen.some((s) => s.rpcMethod === "initialize")).toBe(true);
    expect(seen.some((s) => s.rpcMethod === "tools/list")).toBe(true);
    expect(seen.some((s) => s.rpcMethod === "tools/call")).toBe(false);
    expect(seen.filter((s) => s.method === "POST").every((s) => s.auth === "Bearer test-key")).toBe(true);
  });

  it("summarises hair tools; try-on stays on the REST path", async () => {
    const { fetch } = replayMcpFetch();
    const c = summarise(await listMcpTools({ apiKey: "k", fetch }));
    expect(c).toMatchObject({ reachable: true, toolCount: 50, tryOnToolListed: true, tryOnPath: "rest" });
    expect(c.hairTools).toContain("AI-Hair-Style-Virtual-Try-On");
    expect(c.hairTools.some((n) => n.endsWith("Templates"))).toBe(false);
  });

  it("never throws: no key or an unreachable server reports reachable false", async () => {
    const saved = process.env.YOUCAM_API_KEY;
    delete process.env.YOUCAM_API_KEY;
    try {
      expect(await mcpCapabilities()).toMatchObject({ reachable: false, error: "missing_key" });
    } finally {
      if (saved !== undefined) process.env.YOUCAM_API_KEY = saved;
    }
    resetMcpCache();
    process.env.YOUCAM_API_KEY = saved ?? "k";
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    expect(await mcpCapabilities({ fetch: down })).toMatchObject({ reachable: false, error: "unreachable", tryOnPath: "rest" });
    if (saved === undefined) delete process.env.YOUCAM_API_KEY;
  });
});
