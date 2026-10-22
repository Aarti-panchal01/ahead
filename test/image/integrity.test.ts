import { beforeAll, describe, expect, it } from "vitest";
import { INTEGRITY_THRESHOLD, PLAIN, integrityCheck, measureSkin, restoreInnerFace } from "@/lib/image/integrity";
import { hairMaskFromCategories } from "@/lib/image/sample";
import { deltaE2000, rgbToLab } from "@/lib/image/colour";
import { resize, type RawImage } from "@/lib/image/raw";
import type { Landmarks } from "@/lib/image/landmarks";
import { loadCategories, loadImage, loadLandmarks } from "./helpers";

const hair = async (name: string) => hairMaskFromCategories((await loadCategories(name)).data);
const maxDE = (rs: { deltaE2000: number }[]) => Math.max(...rs.map((r) => r.deltaE2000));

const lab = (im: RawImage, i: number) => rgbToLab(im.data[i * 3], im.data[i * 3 + 1], im.data[i * 3 + 2]);

/**
 * Seam score over the paste's soft edge (0 < mask < 1): for each pair of neighbouring pixels, the colour step in the
 * corrected image minus the larger step in either source (render, original in the render frame). A positive value is
 * an edge the paste made that neither picture has, which is what a visible seam is. Returns the max and 99.9th pct.
 */
function seamScore(corrected: RawImage, result: RawImage, original: RawImage, mask: Float32Array) {
  const o = resize(original, result.width, result.height);
  const W = result.width, H = result.height;
  const vals: number[] = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (!(mask[i] > 0 && mask[i] < 1)) continue;
      for (const j of [i + 1, i + W]) {
        const made = deltaE2000(lab(corrected, i), lab(corrected, j));
        const had = Math.max(deltaE2000(lab(result, i), lab(result, j)), deltaE2000(lab(o, i), lab(o, j)));
        vals.push(made - had);
      }
    }
  }
  vals.sort((a, b) => a - b);
  return { max: vals[vals.length - 1], p999: vals[Math.floor(vals.length * 0.999)], n: vals.length };
}

describe("full look: brows (composited) then hair-transfer W01", () => {
  let src: RawImage, bald: RawImage, full: RawImage, lm: Landmarks;
  beforeAll(async () => {
    [src, bald, full] = await Promise.all([
      loadImage("fixtures/youcam/hero__P1B__browsB.jpg"), // the exact image sent to hair-transfer
      loadImage("fixtures/youcam/hero__P1B.jpg"), // the bald original (different size)
      loadImage("fixtures/youcam/hero__P1B_browsB__W01.jpg"),
    ]);
    lm = loadLandmarks("hero__P1B").landmarks;
  });

  it("is corrected, says the skin was darkened, and every region ends at or below ΔE2000 2", async () => {
    const masks = { original: await hair("hero__P1B__browsB"), result: await hair("hero__P1B_browsB__W01") };
    const rep = integrityCheck(src, full, lm, { hairMasks: masks });
    expect(rep.status).toBe("corrected");
    expect(rep.plainText).toBe("Corrected: the try-on darkened your skin slightly, restored");
    expect(rep.regions).toHaveLength(4);
    expect(maxDE(rep.regions)).toBeGreaterThan(INTEGRITY_THRESHOLD);
    for (const r of rep.regions) expect(r.deltaL).toBeLessThan(-1.5); // darker everywhere, as the truth table says
    expect(rep.after).toHaveLength(4);
    for (const r of rep.after!) expect(r.deltaE2000).toBeLessThanOrEqual(INTEGRITY_THRESHOLD);
    expect(maxDE(rep.after!)).toBeLessThan(0.5);
    expect(rep.correctedImage!.width).toBe(full.width);
    expect(rep.correctedImage!.height).toBe(full.height);
  });

  it("also corrects when checked against the bald original at its own (larger) size", () => {
    expect(bald.width).not.toBe(full.width);
    const rep = integrityCheck(bald, full, lm);
    expect(rep.status).toBe("corrected");
    expect(maxDE(rep.after!)).toBeLessThan(0.5);
  });

  it("leaves the wig untouched: render pixels outside the mask and under hair are unchanged", async () => {
    const masks = { original: await hair("hero__P1B__browsB"), result: await hair("hero__P1B_browsB__W01") };
    const { image, mask } = restoreInnerFace(src, full, lm, masks);
    let changedOutside = 0, changedHair = 0;
    for (let i = 0; i < mask.length; i++) {
      const same = image.data[i * 3] === full.data[i * 3] && image.data[i * 3 + 1] === full.data[i * 3 + 1] && image.data[i * 3 + 2] === full.data[i * 3 + 2];
      if (mask[i] === 0 && !same) changedOutside++;
      if (masks.result[i] && !same) changedHair++;
    }
    expect(changedOutside).toBe(0);
    expect(changedHair).toBe(0);
  });

  it("has no visible seam", async () => {
    const masks = { original: await hair("hero__P1B__browsB"), result: await hair("hero__P1B_browsB__W01") };
    const { image, mask } = restoreInnerFace(src, full, lm, masks);
    const s = seamScore(image, full, src, mask);
    expect(s.n).toBeGreaterThan(1000);
    expect(s.p999).toBeLessThan(3);
    expect(s.max).toBeLessThan(6);
  });
});

describe("plain wig renders p1__F{1..4}__W{1..4}", () => {
  const cases = [1, 2, 3, 4].flatMap((F) => [1, 2, 3, 4].map((W) => [F, W] as const));

  it.each(cases)("F%i x W%i passes or is corrected, and a forced paste leaves no visible seam", async (F, W) => {
    const [original, result] = await Promise.all([loadImage(`assets/ai/faces/F${F}.jpg`), loadImage(`fixtures/youcam/p1__F${F}__W${W}.jpg`)]);
    const lm = loadLandmarks(`F${F}`).landmarks;
    const masks = { original: await hair(`F${F}`), result: await hair(`p1__F${F}__W${W}`) };

    const rep = integrityCheck(original, result, lm, { hairMasks: masks });
    expect(["unchanged", "corrected"]).toContain(rep.status);
    expect(rep.regions.length).toBeGreaterThanOrEqual(3);
    if (rep.status === "unchanged") {
      expect(rep.plainText).toBe(PLAIN.unchanged);
      expect(maxDE(rep.regions)).toBeLessThanOrEqual(INTEGRITY_THRESHOLD);
    } else {
      for (const r of rep.after!) expect(r.deltaE2000).toBeLessThanOrEqual(INTEGRITY_THRESHOLD);
    }

    // None of these trips the check, so force the paste to test the seam on 16 different wigs and faces.
    const { image, mask } = restoreInnerFace(original, result, lm, masks);
    for (const r of measureSkin(original, image, lm, masks)) expect(r.deltaE2000).toBeLessThan(0.5);
    const s = seamScore(image, result, original, mask);
    expect(s.p999).toBeLessThan(3);
    expect(s.max).toBeLessThan(6);
  }, 30000);
});

describe("integrityCheck edge cases", () => {
  let original: RawImage, raw: RawImage, lm: Landmarks;
  beforeAll(async () => {
    [original, raw] = await Promise.all([loadImage("fixtures/youcam/hero__P1B.jpg"), loadImage("fixtures/youcam/hero__P1B__browsB_raw.jpg")]);
    lm = loadLandmarks("hero__P1B").landmarks;
  });

  it("says lightened when the render lightened the skin (raw makeup-vto brows)", () => {
    const rep = integrityCheck(original, raw, lm);
    expect(rep.status).toBe("corrected");
    expect(rep.plainText).toBe("Corrected: the try-on lightened your skin slightly, restored");
    for (const r of rep.after!) expect(r.deltaE2000).toBeLessThanOrEqual(INTEGRITY_THRESHOLD);
  });

  it("an identical render is unchanged, with zero change everywhere", () => {
    const rep = integrityCheck(raw, raw, lm);
    expect(rep.status).toBe("unchanged");
    expect(rep.plainText).toBe("Skin tone check: unchanged");
    for (const r of rep.regions) {
      expect(r.deltaE2000).toBe(0);
      expect(r.deltaL).toBe(0);
    }
    expect(rep.correctedImage).toBeUndefined();
  });

  it("fails plainly without landmarks", () => {
    for (const l of [null, undefined, [] as Landmarks]) {
      const rep = integrityCheck(original, raw, l);
      expect(rep.status).toBe("failed");
      expect(rep.regions).toEqual([]);
      expect(rep.plainText).toBe(PLAIN.noFace);
    }
  });

  it("leaves out regions covered by hair, and fails when nothing is left to measure", () => {
    const covered = new Uint8Array(raw.width * raw.height).fill(1);
    const rep = integrityCheck(original, raw, lm, { hairMasks: { result: covered } });
    expect(rep.status).toBe("failed");
    expect(rep.plainText).toBe(PLAIN.covered);
    expect(() => integrityCheck(original, raw, lm, { hairMasks: { result: new Uint8Array(10) } })).toThrow(/size/);
  });
});
