import { beforeAll, describe, expect, it } from "vitest";
import { compositeFeature, compositeFeatureDetailed } from "@/lib/image/composite";
import { INTEGRITY_THRESHOLD, measureSkin } from "@/lib/image/integrity";
import { rgbToLab, deltaE2000 } from "@/lib/image/colour";
import { resize, type RawImage } from "@/lib/image/raw";
import { LID_UPPER_LEFT, LID_UPPER_RIGHT, toPixels, type Landmarks } from "@/lib/image/landmarks";
import { loadImage, loadLandmarks, seamScore } from "./helpers";

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

  it("needs landmarks and a known feature", () => {
    expect(() => compositeFeature(original, raw, "brows", [])).toThrow();
    expect(() => compositeFeature(original, raw, "lips" as never, lm)).toThrow(/Unknown feature/);
  });
});

describe("compositeFeature lashes (thin band along the lids)", () => {
  // No lash render recorded yet: the raw makeup-vto brow render stands in for "whole face lighter", and a synthetic
  // render adds dark lash strokes above the upper lids on top of a +6 lightening.
  it("takes only a thin band around the eyes: cheeks, nose bridge and chin come back to about 0", () => {
    const { image, mask, shift } = compositeFeatureDetailed(original, raw, "lashes", lm);
    for (const s of shift) expect(s).toBeGreaterThan(3);
    for (const r of measureSkin(original, image, lm)) expect(r.deltaE2000).toBeLessThan(0.5);
    const px = toPixels(lm, raw.width, raw.height);
    const eyeTop = Math.min(...[159, 386].map((i) => px[i][1])), eyeBottom = Math.max(...[145, 374].map((i) => px[i][1]));
    const fw = Math.hypot(px[234][0] - px[454][0], px[234][1] - px[454][1]);
    let area = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] <= 0.01) continue;
      area++;
      const y = Math.floor(i / raw.width);
      expect(y).toBeGreaterThan(eyeTop - 0.1 * fw);
      expect(y).toBeLessThan(eyeBottom + 0.09 * fw);
    }
    expect(area).toBeGreaterThan(0.001 * mask.length);
    expect(area).toBeLessThan(0.02 * mask.length); // thinner than the brows
  });

  it("keeps synthetic lash strokes and drops the global lightening", async () => {
    const o = await loadImage("public/personas/P1B.jpg");
    const l = loadLandmarks("P1B").landmarks;
    const W = o.width, H = o.height, px = toPixels(l, W, H);
    const fw = Math.hypot(px[234][0] - px[454][0], px[234][1] - px[454][1]);
    const r = new Uint8ClampedArray(o.data.length);
    for (let i = 0; i < r.length; i++) r[i] = o.data[i] + 6;
    const strokes: number[] = [];
    for (const lid of [LID_UPPER_LEFT, LID_UPPER_RIGHT])
      for (const k of lid.slice(2, -2)) {
        const [x, y] = px[k];
        for (let d = 1; d <= Math.round(0.02 * fw); d++) {
          const i = (Math.round(y) - d) * W + Math.round(x);
          strokes.push(i);
          for (let c = 0; c < 3; c++) r[i * 3 + c] = 20;
        }
      }
    const { image } = compositeFeatureDetailed(o, { data: r, width: W, height: H }, "lashes", l);
    for (const i of strokes) expect(image.data[i * 3]).toBeLessThan(45);
    for (const m of measureSkin(o, image, l)) expect(m.deltaE2000).toBeLessThan(0.3);
  });

  it("no visible seam on the lash band", () => {
    const { image, mask } = compositeFeatureDetailed(original, raw, "lashes", lm);
    const s = seamScore(image, [raw, resize(original, raw.width, raw.height)], mask);
    expect(s.n).toBeGreaterThan(500);
    expect(s.p999).toBeLessThan(3);
    expect(s.max).toBeLessThan(6);
  });
});
