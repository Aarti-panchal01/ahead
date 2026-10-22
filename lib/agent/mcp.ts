// YouCam beauty MCP server, through the Vercel AI SDK MCP client. DISCOVERY ONLY: initialize + tools/list
// (0 units). This module never calls an MCP tool: every YouCam task tool is paid, and paid steps go through
// the user's approval and the REST path (see lib/agent/tryon.ts and docs/youcam-mcp-tools.json).
import { createMCPClient } from "@ai-sdk/mcp";

export const MCP_URL = "https://mcp-api-01.makeupar.com/mcp/beauty";
/** Takes src + ref photos and hair_color "ref": the same inputs as REST hair-transfer (verified by tools/list, 22 Oct). */
export const MCP_TRYON_TOOL = "AI-Hair-Style-Virtual-Try-On";
const TIMEOUT_MS = 6000;
const CACHE_MS = 10 * 60_000;

export interface McpTool {
  name: string;
  description?: string;
}

export interface McpCapabilities {
  reachable: boolean;
  toolCount: number;
  /** Hair tools the server offers, names only. */
  hairTools: string[];
  /** True when the server lists a tool that can put a worn wig or wrap from a reference photo onto a person. */
  tryOnToolListed: boolean;
  /** Where an approved try-on actually runs. Always REST for now (see README "Which steps use MCP vs REST"). */
  tryOnPath: "rest";
  error?: string;
}

type Fetch = typeof globalThis.fetch;

/** tools/list (all pages). Never calls tools/call. */
export async function listMcpTools(opts: { url?: string; apiKey?: string; fetch?: Fetch } = {}): Promise<McpTool[]> {
  const apiKey = opts.apiKey ?? process.env.YOUCAM_API_KEY;
  if (!apiKey) throw new Error("missing_key");
  const base = opts.fetch ?? globalThis.fetch;
  const guarded: Fetch = (input, init) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes('"tools/call"')) return Promise.reject(new Error("tools/call is not allowed here"));
    return base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  };
  const client = await createMCPClient({
    transport: { type: "http", url: opts.url ?? MCP_URL, headers: { Authorization: `Bearer ${apiKey}` }, fetch: guarded },
    clientName: "ahead-consult",
  });
  try {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await client.listTools(cursor ? { params: { cursor } } : undefined);
      tools.push(...r.tools.map((t) => ({ name: t.name, description: t.description })));
      cursor = r.nextCursor;
      if (!cursor) break;
    }
    return tools;
  } finally {
    await client.close().catch(() => {});
  }
}

export function summarise(tools: McpTool[]): McpCapabilities {
  return {
    reachable: true,
    toolCount: tools.length,
    hairTools: tools.map((t) => t.name).filter((n) => /hair/i.test(n) && !/templates$/i.test(n)),
    tryOnToolListed: tools.some((t) => t.name === MCP_TRYON_TOOL),
    tryOnPath: "rest",
  };
}

let cached: { at: number; value: Promise<McpCapabilities> } | null = null;

/** Cached for 10 minutes per server instance. Never throws. */
export function mcpCapabilities(opts: { fetch?: Fetch; now?: number } = {}): Promise<McpCapabilities> {
  const now = opts.now ?? Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = listMcpTools({ fetch: opts.fetch })
    .then(summarise)
    .catch((e: unknown): McpCapabilities => ({
      reachable: false, toolCount: 0, hairTools: [], tryOnToolListed: false, tryOnPath: "rest",
      error: e instanceof Error && e.message === "missing_key" ? "missing_key" : "unreachable",
    }));
  cached = { at: now, value };
  return value;
}

/** Tests: forget the cached discovery. */
export function resetMcpCache() { cached = null; }
