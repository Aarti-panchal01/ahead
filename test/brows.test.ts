import { describe, expect, it } from "vitest";
import { browsAvailable, browsToggleLabel, cardView, type BrowsLayer } from "@/lib/client/brows";
import { browsImage, heroImage } from "@/lib/client/personas";
import { IDLE, nextRender } from "@/lib/client/renderState";
import type { IntegrityReport } from "@/lib/types";

const ok = (text: string): IntegrityReport => ({ status: "unchanged", regions: [], plainText: text });
const running = nextRender(IDLE, { type: "start" });
const checking = nextRender(running, { type: "result", result: { id: "mock:x", status: "success", resultUrl: "/api/fixtures/rec__P2B__W04" } });
const done = nextRender(checking, { type: "checked", report: ok("plain") });

describe("brows", () => {
  it("are offered only for a sample person whose hair is gone", () => {
    expect(browsAvailable("sample", "gone")).toBe(true);
    expect(browsAvailable("sample", "started")).toBe(false);
    expect(browsAvailable("own", "gone")).toBe(false);
  });

  it("the toggle says what tapping it does", () => {
    expect(browsToggleLabel(true)).toBe("Show without brows");
    expect(browsToggleLabel(false)).toBe("Show with brows");
  });

  it("her photo shows brows by default when her hair is gone", () => {
    expect(heroImage("P1", "gone", true)).toBe("/api/fixtures/hero__P1B__browsB");
    expect(heroImage("P3", "gone", true)).toBe("/api/fixtures/rec__P3B__browsB");
    expect(heroImage("P3", "gone", false)).toBe("/personas/P3B.jpg");
    expect(heroImage("P3", "not_yet", true)).toBe("/personas/P3A.jpg");
    expect(browsImage("P4")).toBe("/api/fixtures/rec__P4B__browsB");
  });

  it("brows off: the plain render and its check", () => {
    const layer: BrowsLayer = { status: "done", image: "data:b", report: ok("brows") };
    expect(cardView(done, layer, false)).toMatchObject({ src: "/api/fixtures/rec__P2B__W04", withBrows: false, report: { plainText: "plain" } });
  });

  it("brows on: the brows version with the check against the brows photo, corrected image first", () => {
    expect(cardView(done, { status: "done", image: "data:b", report: ok("brows") }, true)).toMatchObject({ src: "data:b", withBrows: true, report: { plainText: "brows" } });
    const corrected = { status: "done", image: "data:b", report: { ...ok("fixed"), status: "corrected", correctedImage: "data:c" } } as BrowsLayer;
    expect(cardView(done, corrected, true).src).toBe("data:c");
  });

  it("brows on while they are being added or checked", () => {
    expect(cardView(done, { status: "adding" }, true)).toMatchObject({ src: "/api/fixtures/rec__P2B__W04", withBrows: false, browsNote: "Adding her brows to this one" });
    const v = cardView(done, { status: "checking", image: "data:b" }, true);
    expect(v).toMatchObject({ src: "data:b", checking: true, withBrows: true });
    expect(v.report).toBeUndefined();
  });

  it("brows that failed: plain render, said plainly", () => {
    const v = cardView(done, { status: "failed" }, true);
    expect(v.withBrows).toBe(false);
    expect(v.browsNote).toMatch(/couldn't add the brows/);
  });

  it("nothing about brows before the render exists", () => {
    expect(cardView(running, undefined, true)).toEqual({ src: undefined, report: undefined, checking: false, withBrows: false });
  });
});
