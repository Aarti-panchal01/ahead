import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hairCropBox } from "@/lib/client/image";
import { parseInline, parseMarkdown, splitRow } from "@/lib/client/markdown";

describe("markdown reader (honesty page)", () => {
  it("reads headings, lists, paragraphs and tables", () => {
    const md = "# Title\n\nSome **bold** text\nwrapped.\n\n- one\n- two `code`\n\n| # | A | B |\n|---|---|---|\n| 1 | x | y |\n| 2 | p | q |\n";
    expect(parseMarkdown(md)).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "para", text: "Some **bold** text wrapped." },
      { type: "list", items: ["one", "two `code`"] },
      { type: "table", header: ["#", "A", "B"], rows: [["1", "x", "y"], ["2", "p", "q"]] },
    ]);
  });

  it("keeps pipes inside code and escaped pipes in one cell", () => {
    expect(splitRow("| a | `x|y` | b \\| c |")).toEqual(["a", "`x|y`", "b | c"]);
  });

  it("splits inline bold and code; raw HTML stays text", () => {
    expect(parseInline("A **B** `C` <b>D</b>")).toEqual([
      { kind: "text", text: "A " }, { kind: "bold", text: "B" }, { kind: "text", text: " " }, { kind: "code", text: "C" }, { kind: "text", text: " <b>D</b>" },
    ]);
  });

  it("reads the real truth table: every row, every column", () => {
    const md = fs.readFileSync(path.join(process.cwd(), "docs", "api-truth-table.md"), "utf8");
    const blocks = parseMarkdown(md);
    const table = blocks.find((b) => b.type === "table");
    if (table?.type !== "table") throw new Error("no table");
    expect(table.header).toEqual(["#", "What we tested", "What YouCam actually does", "Evidence", "Consequence / fix"]);
    expect(table.rows.length).toBeGreaterThanOrEqual(18);
    expect(table.rows.every((r) => r.length === 5)).toBe(true);
    expect(table.rows.map((r) => r[0]).slice(0, 18)).toEqual(Array.from({ length: 18 }, (_, i) => String(i + 1)));
    expect(blocks.some((b) => b.type === "heading" && b.text === "API truth table")).toBe(true);
  });
});

describe("hairCropBox (match card, own photo)", () => {
  it("finds a square that is all hair", () => {
    const w = 200, h = 200, mask = new Uint8Array(w * h);
    for (let y = 100; y < 160; y++) for (let x = 20; x < 90; x++) mask[y * w + x] = 1;
    const b = hairCropBox(mask, w, h)!;
    expect(b.size).toBe(24);
    expect(b.x).toBeGreaterThanOrEqual(20);
    expect(b.x + b.size).toBeLessThanOrEqual(90);
    expect(b.y).toBeGreaterThanOrEqual(100);
    expect(b.y + b.size).toBeLessThanOrEqual(160);
  });

  it("gives up when there isn't enough hair", () => {
    const w = 200, h = 200, mask = new Uint8Array(w * h);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 200; x++) mask[y * w + x] = 1;
    expect(hairCropBox(mask, w, h)).toBeNull();
  });
});
