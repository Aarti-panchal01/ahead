import { beforeAll, describe, expect, it } from "vitest";
import { compositeFeature, compositeFeatureDetailed } from "@/lib/image/composite";
import { INTEGRITY_THRESHOLD, measureSkin } from "@/lib/image/integrity";
import { rgbToLab, deltaE2000 } from "@/lib/image/colour";
import { resize, type RawImage } from "@/lib/image/raw";
import type { Landmarks } from "@/lib/image/landmarks";
import { loadImage, loadLandmarks } from "./helpers";

// hero__P1B = bald original; browsB_raw = makeup-vto brow render (whole face lighter); browsB = the Python-fixed one.
let original: RawImage, raw: RawImage, pythonFixed: RawImage, lm: Landmarks;

beforeAll(async () => {
  [original, raw, pythonFixed] = await Promise.all([
    loadImage("fixtures/youcam/hero__P1B.jpg"),
    loadImage("fixtures/youcam/hero__P1B__browsB_raw.jpg"),
    loadImage("fixtures/youcam/hero__P1B__browsB.jpg"),
  ]);
  lm = loadLandmarks("hero__P1B").landmarks;
});

const meanL = (img: RawImage, mask: Float32Array, min: number) => {
  let s = 0, n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= min) continue;
    s += rgbToLab(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2])[0];
    n++;
  }
  return s / n;
};

describe("compositeFeature brows (port of brow_composite.py)", () => {
  it("the raw makeup-vto render trips the integrity check (whole face lighter)", () => {
    const before = measureSkin(original, raw, lm);
    expect(before).toHaveLength(4);
    expect(Math.max(...before.map((r) => r.deltaE2000))).toBeGreaterThan(INTEGRITY_THRESHOLD);
    for (const r of before) expect(r.deltaL).toBeGreaterThan(3); // lighter everywhere, as in the truth table
  });

  it("brings cheeks, nose bridge and chin back to about 0 change", () => {
    const fixed = compositeFeature(original, raw, "brows", lm);
    expect(fixed.width).toBe(raw.width);
    expect(fixed.height).toBe(raw.height);
    for (const r of measureSkin(original, fixed, lm)) {
      expect(r.deltaE2000).toBeLessThan(0.5);
      expect(Math.abs(r.deltaL)).toBeLessThan(0.5);
    }
  });

  it("keeps the new brows: brow area darker than the original, global lightening removed", () => {
    const { image, mask, shift } = compositeFeatureDetailed(original, raw, "brows", lm);
    for (const s of shift) expect(s).toBeGreaterThan(3); // the render was lighter by several RGB levels
    const small = resize(original, raw.width, raw.height); // the original in the render frame, as the composite sees it
    expect(meanL(image, mask, 0.8)).toBeLessThan(meanL(small, mask, 0.8) - 1);
    // Outside the feathered mask the pixels are the original's (only resampled).
    let maxOutside = 0;
    for (let i = 0; i < mask.length; i += 7) {
      if (mask[i] > 0.001) continue;
      for (let c = 0; c < 3; c++) maxOutside = Math.max(maxOutside, Math.abs(image.data[i * 3 + c] - small.data[i * 3 + c]));
    }
    expect(maxOutside).toBeLessThanOrEqual(1);
  });

  it("matches the Python reference output closely", () => {
    const fixed = compositeFeature(original, raw, "brows", lm);
    let sum = 0, n = 0;
    for (let i = 0; i < fixed.width * fixed.height; i += 13) {
      const a = rgbToLab(fixed.data[i * 3], fixed.data[i * 3 + 1], fixed.data[i * 3 + 2]);
      const b = rgbToLab(pythonFixed.data[i * 3], pythonFixed.data[i * 3 + 1], pythonFixed.data[i * 3 + 2]);
      sum += deltaE2000(a, b);
      n++;
    }
    expect(sum / n).toBeLessThan(1); // different resampler and JPEG, same result
  });

  it("refuses lashes for now and needs landmarks", () => {
    expect(() => compositeFeature(original, raw, "lashes", lm)).toThrow(/not supported yet/);
    expect(() => compositeFeature(original, raw, "brows", [])).toThrow();
  });
});

