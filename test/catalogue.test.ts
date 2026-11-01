import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CATALOGUE, referenceSku } from "@/lib/catalogue";

describe("catalogue", () => {
  it("every item is labelled AI-generated and has a real image", () => {
    for (const x of CATALOGUE) {
      expect(x["AI-generated"]).toBe(true);
      expect(x.colour).toMatch(/^#[0-9A-F]{6}$/);
      expect(fs.existsSync(path.join("public", x.image))).toBe(true);
    }
  });
  it("each of the 16 catalogue styles has a distinct id and distinct YouCam reference image", () => {
    expect(CATALOGUE).toHaveLength(16);
    expect(new Set(CATALOGUE.map((x) => x.id)).size).toBe(16);
    const references = CATALOGUE.map((x) => createHash("sha256").update(fs.readFileSync(path.join("public", x.image))).digest("hex"));
    expect(new Set(references).size).toBe(16);
  });
  it("assigns stable, distinct Ahead matching SKUs to every wig and wrap", () => {
    const skus = CATALOGUE.map(referenceSku);
    expect(skus).toHaveLength(16);
    expect(new Set(skus).size).toBe(16);
    expect(skus.filter((sku) => sku.startsWith("AHD-WIG-"))).toHaveLength(12);
    expect(skus.filter((sku) => sku.startsWith("AHD-WRP-"))).toHaveLength(4);
  });
  it("only on-model photos are usable as references (mannequin and flat fail with error_no_face)", () => {
    for (const x of CATALOGUE) expect(x.usableAsReference).toBe(x.reference === "on-model");
  });
});
