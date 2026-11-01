// Component tests with react-dom/server (no extra test libraries): what each card state shows.
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResultCard from "@/components/results/ResultCard";
import IntegrityLine, { forWhom, skippedClause } from "@/components/results/IntegrityLine";
import Landing from "@/app/page";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { CATALOGUE } from "@/lib/catalogue";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { IDLE, nextRender, type RenderState } from "@/lib/client/renderState";
import { cardView } from "@/lib/client/brows";
import type { RankedItem } from "@/lib/types";

// vitest follows tsconfig "jsx": "preserve" and compiles JSX to React.createElement (classic runtime).
// Until vitest.config.ts sets esbuild.jsx = "automatic" (not ui-owned), provide React globally.
(globalThis as unknown as { React: typeof React }).React = React;

const ranked: RankedItem = { item: CATALOGUE.find((x) => x.id === "W01")!, colourDistance: 3, reason: "closest" };
const sample = { isSample: true, name: "Sample person 1" };
const noop = () => {};
const card = (state: RenderState, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ResultCard, { ranked, state, view: cardView(state, undefined, false), subject: sample, whose: "her", label: "close", selected: false, onToggleCompare: noop, onRetry: noop, ...extra }));

const running = nextRender(IDLE, { type: "start" });
const done = nextRender(nextRender(running, { type: "result", result: { id: "t", status: "success", resultUrl: "/api/fixtures/rec__P1B__W01" } }), {
  type: "checked", report: { status: "unchanged", regions: [], plainText: "Skin tone check: unchanged" },
});
const noRecording = nextRender(running, { type: "result", result: { id: "", status: "error", errorCode: "no_recording", message: "This demo combination isn't recorded yet. Pick another wig or face." } });

describe("ResultCard", () => {
  it("shows the render, the name, the check and the disclaimer without a per-image AI label", () => {
    const html = card(done);
    expect(html).toContain('src="/api/fixtures/rec__P1B__W01"');
    expect(html).not.toContain("AI-generated");
    expect(html).toContain(ranked.item.name);
    expect(html).toContain("Skin tone check: unchanged");
    expect(html).toContain(PREVIEW_DISCLAIMER);
    expect(html).toContain("Close to her hair");
  });

  it("shows progress while running, with the expected time", () => {
    const html = card(running);
    expect(html).toContain("9 to 30 seconds");
    expect(html).toContain('role="status"');
    expect(html).toContain(PREVIEW_DISCLAIMER);
  });

  it("a sample card only ever shows her: a genuine failure is a plain error, never our model", () => {
    const html = card(noRecording);
    expect(html).not.toContain("/catalogue/W01.jpg");
    expect(html).not.toContain("Shown on our model");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Try this one again");
  });

  it("a sample card before its render starts shows a placeholder, not our model", () => {
    const html = card(IDLE);
    expect(html).toContain("Getting her preview ready.");
    expect(html).not.toContain("/catalogue/W01.jpg");
  });

  it("offers one retry after a YouCam error", () => {
    const err = nextRender(running, { type: "result", result: { id: "", status: "error", errorCode: "unknown_internal_error", message: "Try again." } });
    expect(card(err)).toContain("Retry this style");
  });

  it("labels the compare button with what it does", () => {
    expect(card(done)).toContain("Save to fitting bag");
    expect(card(done, { selected: true })).toContain("Remove from fitting bag");
    expect(card(done, { selected: true })).toContain('aria-pressed="true"');
  });

  it("never substitutes a model face for an own-photo preview", () => {
    const html = card(IDLE, { subject: { isSample: false, name: "You" }, whose: "your" });
    expect(html).toContain("This look will be shown on your photo.");
    expect(html).not.toContain("Shown on our model");
    expect(html).toContain(PREVIEW_DISCLAIMER);
    expect(html).not.toContain("Show me in this one");
  });

  it("offers a manual retry action when requested by the parent flow", () => {
    const html = card(IDLE, { subject: { isSample: false, name: "You" }, whose: "your", onDemand: true });
    expect(html).toContain("See this look on me");
    expect(card(running, { subject: { isSample: false, name: "You" }, whose: "your", onDemand: true })).not.toContain("See this look on me");
  });

  it("an own photo's error is shown in plain words", () => {
    const html = card(noRecording, { subject: { isSample: false, name: "You" }, whose: "your" });
    expect(html).toContain("isn&#x27;t recorded yet");
  });

  it("uses the neutral label when the colour isn't close", () => {
    expect(card(done, { label: "neutral" })).toContain("Worth a look");
    expect(card(done, { label: "neutral" })).not.toContain("Close to");
  });

  it("shows the brows version and its own check when brows are on", () => {
    const view = cardView(done, { status: "done", image: "data:image/jpeg;base64,BROWS", report: { status: "unchanged", regions: [], plainText: "Skin tone check against her brows photo: unchanged" } }, true);
    const html = card(done, { view });
    expect(html).toContain('src="data:image/jpeg;base64,BROWS"');
    expect(html).toContain("with brows");
    expect(html).toContain("against her brows photo");
  });
});

describe("IntegrityLine", () => {
  it("is amber when the check failed", () => {
    const html = renderToStaticMarkup(h(IntegrityLine, { report: { status: "failed", regions: [], plainText: "Skin tone check: we could not correct this one" } }));
    expect(html).toMatch(/class="[^"]*warn/);
  });
  it("keeps the dot beside the first line and the text in its own block", () => {
    const html = renderToStaticMarkup(h(IntegrityLine, { report: { status: "unchanged", regions: [], plainText: "Skin tone check: unchanged" } }));
    expect(html).toMatch(/<span class="[^"]*integrityDot[^"]*" aria-hidden="true"><\/span><p class="[^"]*integrityText/);
  });
  it("says in plain words when a region was left out", () => {
    const html = renderToStaticMarkup(h(IntegrityLine, { report: { status: "unchanged", regions: [], plainText: "Skin tone check: unchanged", skippedRegions: ["cheek_left"] } }));
    expect(html).toContain("One cheek was in shadow, so we checked the other.");
  });
});

describe("forWhom", () => {
  it("says her skin on a sample person, your skin on your photo", () => {
    expect(forWhom("Corrected: the try-on lightened your skin slightly, restored", "her")).toBe("Corrected: the try-on lightened her skin slightly, restored");
    expect(forWhom("Corrected: the try-on lightened your skin slightly, restored", "your")).toContain("your skin");
  });
});

describe("skippedClause", () => {
  it("words one, two and mixed regions", () => {
    expect(skippedClause(undefined)).toBe("");
    expect(skippedClause(["cheek_left"])).toBe("One cheek was in shadow, so we checked the other.");
    expect(skippedClause(["cheek_right"])).toBe("One cheek was in shadow, so we checked the other.");
    expect(skippedClause(["cheek_left", "cheek_right"])).toBe("Both cheeks were in shadow, so we checked the nose and chin.");
    expect(skippedClause(["cheek_right", "chin"])).toBe("One cheek and the chin were in shadow or covered, so we checked the other cheek and the nose.");
  });
});

describe("Landing", () => {
  const html = renderToStaticMarkup(h(Landing));
  it("has the Ahead headline, one primary button and the sample option", () => {
    expect(html).toContain("See your next look,");
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toContain("Start with my photo");
    expect(html).toContain("A personal try-on for treatment-related hair loss");
    expect(html).toContain("Explore sample previews");
    expect(html).toContain("No upload or live API units needed");
  });
  it("uses a typographic lookbook card without synthetic portrait imagery", () => {
    expect(html.match(/<img /g)?.length ?? 0).toBe(0);
    expect(html).toContain("Powered by YouCam Hair Transfer.");
    expect(html).not.toContain("<figcaption");
  });
});

describe("LoadingSkeleton", () => {
  it("renders with aria-busy and accessible label", () => {
    const html = renderToStaticMarkup(h(LoadingSkeleton, { label: "Loading your matches" }));
    expect(html).toContain(`aria-busy="true"`);
    expect(html).toContain(`aria-label="Loading your matches"`);
  });
});

