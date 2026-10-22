import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { metadata as start } from "@/app/start/layout";
import { metadata as capture } from "@/app/capture/layout";
import { metadata as stage } from "@/app/stage/layout";
import { metadata as results } from "@/app/results/layout";
import { metadata as plan } from "@/app/plan/layout";
import { metadata as honesty } from "@/app/how-we-tested/page";
import { metadata as brief } from "@/app/brief/[id]/page";
import HowWeTested from "@/app/how-we-tested/page";
import NeedPhoto from "@/components/NeedPhoto";

(globalThis as unknown as { React: typeof React }).React = React;

describe("titles and headings", () => {
  it("every route has its own title under the 'Ahead · ' template", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8")).toContain('title: { default: "Ahead", template: "Ahead · %s" }');
    const titles = [start, capture, stage, results, plan, honesty, brief].map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(results.title).toBe("Your matches");
    expect(brief.title).toBe("Stylist brief"); // server metadata: set before hydration
  });

  it("screens other than landing start with an h1, not an h2", () => {
    const html = renderToStaticMarkup(h(HowWeTested));
    expect(html.indexOf("<h1>How we tested this</h1>")).toBeGreaterThan(-1);
    expect(html.indexOf("<h1>")).toBeLessThan(html.indexOf("<h2"));
    expect(renderToStaticMarkup(h(NeedPhoto))).toContain("<h1>Choose a photo first</h1>");
    for (const f of ["app/start/page.tsx", "app/capture/page.tsx", "app/stage/page.tsx", "components/plan/PlanView.tsx", "components/brief/BriefView.tsx", "components/results/ResultsView.tsx"]) {
      expect(fs.readFileSync(path.join(process.cwd(), f), "utf8"), f).toContain("<h1");
    }
  });
});
