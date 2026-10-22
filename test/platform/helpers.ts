import sharp from "sharp";
import { vi } from "vitest";
import { MemoryStore, setStore } from "@/lib/store";

let n = 0;
/** A distinct small JPEG each call (so cache keys differ). */
export async function jpeg(w = 400, h = 500): Promise<Buffer> {
  n++;
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: (n * 37) % 256, g: (n * 91) % 256, b: (n * 13) % 256 } } }).jpeg().toBuffer();
}

export function freshStore() {
  const s = new MemoryStore();
  setStore(s);
  return s;
}

export interface FakeYoucam {
  calls: { method: string; url: string }[];
  creates: () => number;
  setBalance(b: number): void;
  /** Next create answers (consumed in order; default is a fresh task id). */
  createAnswers: (() => Response | Promise<Response>)[];
  taskStatus: Record<string, unknown>;
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

/** Stubs global fetch with a fake YouCam. No network is ever touched. */
export function fakeYoucam(balance = 300): FakeYoucam {
  let bal = balance;
  let taskN = 0;
  const f: FakeYoucam = {
    calls: [],
    creates: () => f.calls.filter((c) => c.method === "POST" && c.url.includes("/task/")).length,
    setBalance: (b) => { bal = b; },
    createAnswers: [],
    taskStatus: {},
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    f.calls.push({ method, url });
    if (url.endsWith("/client/credit")) return json({ results: [{ amount_dec: bal }] });
    if (url.endsWith("/s2s/v2.0/file")) return json({ data: { files: [{ file_id: `file${f.calls.length}`, requests: [{ url: "https://upload.example/put", headers: {} }] }] } });
    if (url === "https://upload.example/put") return new Response("", { status: 200 });
    if (method === "POST" && url.includes("/task/")) {
      const next = f.createAnswers.shift();
      return next ? next() : json({ status: 200, data: { task_id: `task${++taskN}` } });
    }
    if (method === "GET" && url.includes("/task/hair-transfer/")) {
      const id = decodeURIComponent(url.split("/").pop()!);
      return json({ status: 200, data: f.taskStatus[id] ?? { task_status: "running" } });
    }
    return json({}, 404);
  }));
  return f;
}

export function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, undefined as unknown as string); else vi.stubEnv(k, v);
  }
}
