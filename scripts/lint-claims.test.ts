// Unit tests for the CI claim linter (scripts/lint-claims.ts): what it reads as copy, what it flags, and that the
// real tree is clean apart from the documented exception.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyAllowList, extractCopy, jsonStrings, run, scanPieces } from "./lint-claims";

describe("extractCopy", () => {
  const src = [
    "// This comment says cure and treat and is not copy.",
    'const a = "Plain text";',
    "const b = `Hello ${name}, welcome`;",
    "export default function X() {",
    "  return (",
    "    <main>",
    "      <p>It can&rsquo;t hurt to look.</p>",
    '      <a href="/x" aria-label="Open the page">Go on</a>',
    "      {/* a comment that says guarantee */}",
    "    </main>",
    "  );",
    "}",
  ].join("\n");
  const texts = extractCopy(src).map((p) => p.text);

  it("reads strings, template literals and JSX text", () => {
    expect(texts).toContain("Plain text");
    expect(texts).toContain("Hello X, welcome");
    expect(texts).toContain("It can't hurt to look.");
    expect(texts).toContain("Open the page");
    expect(texts).toContain("Go on");
  });
  it("skips comments", () => {
    expect(texts.join(" ")).not.toMatch(/cure|guarantee/);
  });
  it("reports 1-based line numbers", () => {
    expect(extractCopy(src).find((p) => p.text === "Plain text")?.line).toBe(2);
  });
});

describe("scanPieces", () => {
  it("flags medical wording in a string and in JSX text", () => {
    const bad = extractCopy('const a = "This will cure your hair loss."; const b = <p>We guarantee results.</p>;');
    const hits = scanPieces("x.tsx", bad, true).map((h) => h.rule);
    expect(hits).toContain("cure");
    expect(hits).toContain("guarantee");
  });
  it("lets UI copy say deleted from YouCam, but not agent fixtures", () => {
    const piece = [{ text: "Your try-ons are deleted from YouCam at the end.", line: 1 }];
    expect(scanPieces("ui.tsx", piece, true)).toEqual([]);
    expect(scanPieces("fixture.json", piece, false).map((h) => h.rule)).toEqual(["deleted_from_youcam"]);
  });
  it("leaves 'treatment' alone", () => {
    expect(scanPieces("x.tsx", [{ text: "Plan around your first treatment date.", line: 1 }], true)).toEqual([]);
  });
});

describe("allow list", () => {
  it("removes a matching hit and reports an entry that matches nothing", () => {
    const f = [{ file: "a.json", line: 0, rule: "cure", sentence: "We cure it." }];
    const used = { file: "a.json", rule: "cure", contains: "We cure", reason: "test" };
    const stale = { file: "b.json", rule: "cure", contains: "nothing", reason: "test" };
    expect(applyAllowList(f, [used, stale])).toEqual({ blocked: [], unused: [stale] });
    expect(applyAllowList(f, []).blocked).toHaveLength(1);
  });
  it("reads every string in a JSON document", () => {
    expect(jsonStrings({ a: "x", b: [{ c: "y" }, 3], d: null })).toEqual(["x", "y"]);
  });
});

describe("the real tree", () => {
  it("has no medical wording in UI copy or agent fixtures, apart from the documented exception", () => {
    const r = run(path.resolve(__dirname, ".."));
    expect(r.files).toBeGreaterThan(40);
    expect(r.blocked).toEqual([]);
    expect(r.unused).toEqual([]);
  });
});
