import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/lib/catalogue";

describe("catalogue", () => {
  it("every item is labelled AI-generated and has a real image", () => {
    for (const x of CATALOGUE) {
      expect(x["AI-generated"]).toBe(true);
      expect(x.colour).toMatch(/^#[0-9A-F]{6}$/);
      expect(fs.existsSync(path.join("public", x.image))).toBe(true);
    }
  });
  it("only on-model photos are usable as references (mannequin and flat fail with error_no_face)", () => {
    for (const x of CATALOGUE) expect(x.usableAsReference).toBe(x.reference === "on-model");
  });
});
