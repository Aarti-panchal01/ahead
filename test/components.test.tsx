// Component tests with react-dom/server (no extra test libraries): what each card state shows.
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResultCard from "@/components/results/ResultCard";
import IntegrityLine from "@/components/results/IntegrityLine";
import Landing from "@/app/page";
import { CATALOGUE } from "@/lib/catalogue";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { IDLE, nextRender, type RenderState } from "@/lib/client/renderState";
import type { RankedItem } from "@/lib/types";

// vitest follows tsconfig "jsx": "preserve" and compiles JSX to React.createElement (classic runtime).
// Until vitest.config.ts sets esbuild.jsx = "automatic" (not ui-owned), provide React globally.
(globalThis as unknown as { React: typeof React }).React = React;

const ranked: RankedItem = { item: CATALOGUE.find((x) => x.id === "W01")!, colourDistance: 3, reason: "closest" };
const sample = { isSample: true, name: "Sample person 1" };
const noop = () => {};
const card = (state: RenderState, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(ResultCard, { ranked, state, subject: sample, canRender: true, selected: false, onToggleCompare: noop, onRetry: noop, ...extra }));

const running = nextRender(IDLE, { type: "start" });
const done = nextRender(nextRender(running, { type: "result", result: { id: "t", status: "success", resultUrl: "/api/fixtures/rec__P1B__W01" } }), {
  type: "checked", report: { status: "unchanged", regions: [], plainText: "Skin tone check: unchanged" },
});
const noRecording = nextRender(running, { type: "result", result: { id: "", status: "error", errorCode: "no_recording", message: "This demo combination isn't recorded yet. Pick another wig or face." } });

describe("ResultCard", () => {
  it("shows the render, the AI label, the name, the check and the disclaimer", () => {
    const html = card(done);
    expect(html).toContain('src="/api/fixtures/rec__P1B__W01"');
    expect(html).toContain("AI-generated");
    expect(html).toContain(ranked.item.name);
    expect(html).toContain("Skin tone check: unchanged");
    expect(html).toContain(PREVIEW_DISCLAIMER);
    expect(html).toContain("Close to your hair");
  });

  it("shows progress while running, with the expected time", () => {
    const html = card(running);
    expect(html).toContain("9 to 30 seconds");
    expect(html).toContain('role="status"');
    expect(html).toContain(PREVIEW_DISCLAIMER);
  });

  it("shows a kind message and the item on our model when there is no recording, never a broken image", () => {
    const html = card(noRecording);
    expect(html).toContain("isn&#x27;t recorded yet");
    expect(html).toContain('src="/catalogue/W01.jpg"');
    expect(html).toContain("Shown on our model");
    expect(html).not.toContain("Try this one again");
  });

  it("offers one retry after a YouCam error", () => {
    const err = nextRender(running, { type: "result", result: { id: "", status: "error", errorCode: "unknown_internal_error", message: "Try again." } });
    expect(card(err)).toContain("Try this one again");
  });

  it("labels the compare button with what it does", () => {
    expect(card(done)).toContain("Add to compare");
    expect(card(done, { selected: true })).toContain("Remove from compare");
    expect(card(done, { selected: true })).toContain('aria-pressed="true"');
  });

  it("in demo mode with your own photo, shows the item on our model", () => {
    const html = card(IDLE, { canRender: false, subject: { isSample: false, name: "You" } });
    expect(html).toContain("Shown on our model");
    expect(html).toContain(PREVIEW_DISCLAIMER);
  });
});

describe("IntegrityLine", () => {
  it("is amber when the check failed", () => {
    const html = renderToStaticMarkup(h(IntegrityLine, { report: { status: "failed", regions: [], plainText: "Skin tone check: we could not correct this one" } }));
    expect(html).toMatch(/class="[^"]*warn/);
  });
});

describe("Landing", () => {
  const html = renderToStaticMarkup(h(Landing));
  it("has the tagline, one primary button and the sample option", () => {
    expect(html).toContain("Try on your next hair, before you lose this one.");
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toContain("Take one photo");
    expect(html).toContain("Try with a sample person");
  });
  it("labels every image as AI-generated", () => {
    expect(html.match(/<img /g)?.length).toBe(3);
    expect(html.match(/AI-generated<\/figcaption>/g)?.length).toBe(3);
  });
});
