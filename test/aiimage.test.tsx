import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import AiImage, { srcSetFor } from "@/components/AiImage";

(globalThis as unknown as { React: typeof React }).React = React;

describe("AiImage", () => {
  it("offers the 320 and 640 px copies for personas, catalogue, landing and recordings", () => {
    expect(srcSetFor("/personas/P1A.jpg")).toBe("/personas/320/P1A.jpg 320w, /personas/640/P1A.jpg 640w, /personas/P1A.jpg 821w");
    expect(srcSetFor("/api/fixtures/rec__P1B__W01")).toBe("/rec/320/rec__P1B__W01.jpg 320w, /rec/640/rec__P1B__W01.jpg 640w, /api/fixtures/rec__P1B__W01 821w");
    expect(srcSetFor("/api/fixtures/p1__F1__W1")).toBeUndefined();
    expect(srcSetFor("data:image/jpeg;base64,xx")).toBeUndefined();
  });

  it("every copy it points to exists", () => {
    for (const f of ["personas/320/P1A.jpg", "catalogue/640/W01.jpg", "landing/320/hero__P1B_browsB__W01.jpg", "rec/640/rec__P4B__W11.jpg", "rec/320/hero__P1B__browsB.jpg"]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", f)), f).toBe(true);
    }
  });

  it("only the priority image is eager and high priority; the label always shows", () => {
    const hero = renderToStaticMarkup(h(AiImage, { src: "/personas/P1A.jpg", alt: "a", width: 821, height: 1024, priority: true }));
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchPriority="high"');
    expect(hero).toContain("AI-generated");
    const other = renderToStaticMarkup(h(AiImage, { src: "/personas/P1A.jpg", alt: "a", width: 821, height: 1024 }));
    expect(other).toContain('loading="lazy"');
    expect(other).toContain('decoding="async"');
    expect(other).toContain('width="821"');
  });
});
