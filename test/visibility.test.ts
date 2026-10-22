import { describe, expect, it } from "vitest";
import { NearViewport, afterFirstPaint, resetFirstPaint } from "@/lib/client/visibility";

class FakeIO {
  static last: FakeIO;
  observed = new Set<Element>();
  constructor(public cb: (e: { isIntersecting: boolean; target: Element }[]) => void, public opts: { rootMargin: string }) { FakeIO.last = this; }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  fire(el: Element, isIntersecting = true) { this.cb([{ isIntersecting, target: el }]); }
}
const el = () => ({ dataset: {} as Record<string, string> }) as unknown as Element;

describe("NearViewport", () => {
  it("waits until the card comes within the margin, then stays resolved", async () => {
    const near = new NearViewport("200px", FakeIO as unknown as typeof IntersectionObserver);
    expect(FakeIO.last.opts.rootMargin).toBe("200px");
    const card = el();
    near.ref("k")(card);
    let done = false;
    const p = near.whenNear("k").then(() => { done = true; });
    FakeIO.last.fire(card, false);
    await Promise.resolve();
    expect(done).toBe(false);
    FakeIO.last.fire(card);
    await p;
    expect(done).toBe(true);
    await near.whenNear("k"); // already seen
  });

  it("gives the same ref function per key and unobserves a removed card", () => {
    const near = new NearViewport("200px", FakeIO as unknown as typeof IntersectionObserver);
    expect(near.ref("a")).toBe(near.ref("a"));
    const card = el();
    near.ref("a")(card);
    expect(FakeIO.last.observed.has(card)).toBe(true);
    near.ref("a")(null);
    expect(FakeIO.last.observed.has(card)).toBe(false);
  });

  it("without IntersectionObserver, everything counts as near", async () => {
    const near = new NearViewport("200px", undefined);
    near.ref("x")(el());
    await near.whenNear("x");
  });
});

describe("afterFirstPaint", () => {
  it("waits two frames, then idle time", async () => {
    resetFirstPaint();
    const steps: string[] = [];
    const win = {
      requestAnimationFrame: (f: () => void) => { steps.push("raf"); f(); return 1; },
      requestIdleCallback: (f: () => void) => { steps.push("idle"); f(); return 1; },
      setTimeout: () => 0,
    } as unknown as Window & typeof globalThis;
    await afterFirstPaint(win);
    expect(steps).toEqual(["raf", "raf", "idle"]);
    resetFirstPaint();
  });
  it("resolves at once on the server", async () => {
    resetFirstPaint();
    await afterFirstPaint(undefined);
  });
});
