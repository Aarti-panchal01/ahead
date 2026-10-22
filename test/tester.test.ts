import { describe, expect, it, vi } from "vitest";
import { TESTER_HEADER, TESTER_WRONG, forgetCode, needsTesterCode, storedCode, submitTesterCode, testerHeaders } from "@/lib/client/tester";
import fs from "node:fs";
import path from "node:path";

const fakeStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("tester code", () => {
  it("is needed only when the server asks and none is stored", () => {
    const s = fakeStore();
    forgetCode(s);
    expect(needsTesterCode({ mode: "live", servingRecordings: false, testerRequired: true }, s)).toBe(true);
    expect(needsTesterCode({ mode: "live", servingRecordings: false, testerRequired: false }, s)).toBe(false);
    expect(needsTesterCode({ mode: "live", servingRecordings: false }, s)).toBe(false);
  });

  it("a good code is stored for this visit and sent on own-photo try-ons", async () => {
    const s = fakeStore();
    forgetCode(s);
    const f = vi.fn(async () => json({ ok: true })) as unknown as typeof fetch;
    expect(await submitTesterCode("  judge-42 ", f, s)).toEqual({ ok: true });
    expect(JSON.parse(String((f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body))).toEqual({ code: "judge-42" });
    expect(storedCode(s)).toBe("judge-42");
    expect(testerHeaders(s)).toEqual({ [TESTER_HEADER]: "judge-42" });
    expect(needsTesterCode({ mode: "live", servingRecordings: false, testerRequired: true }, s)).toBe(false);
    forgetCode(s);
    expect(testerHeaders(s)).toEqual({});
  });

  it("a wrong code says so plainly and stores nothing", async () => {
    const s = fakeStore();
    forgetCode(s);
    const f = vi.fn(async () => json({ ok: false }, 403)) as unknown as typeof fetch;
    expect(await submitTesterCode("nope", f, s)).toEqual({ ok: false, message: TESTER_WRONG });
    expect(TESTER_WRONG).toBe("That code didn't work. Check it and try again.");
    expect(storedCode(s)).toBeUndefined();
  });

  it("never throws when offline", async () => {
    const f = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect((await submitTesterCode("x", f, fakeStore())).ok).toBe(false);
  });
});

describe("owner's wording", () => {
  it("UI copy never calls the skin change a bug, bias or flaw", () => {
    const roots = ["app", "components", "lib/client"].map((d) => path.join(process.cwd(), d));
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!p.includes(`${path.sep}api`)) walk(p); } else if (/\.(tsx?|css)$/.test(e.name)) files.push(p);
    });
    roots.forEach(walk);
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/\b(bug|bias|biased|flaw)\b/i);
  });
});
