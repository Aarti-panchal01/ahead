import { beforeAll, describe, expect, it } from "vitest";
import { applyBrows, applyBrowsDetailed, fitSimilarity, type BrowsApplied } from "@/lib/image/brows";
import { coverMaskFromCategories } from "@/lib/image/sample";
import { rgbToLab } from "@/lib/image/colour";
import { fillPolygon, median, type Point, type RawImage } from "@/lib/image/raw";
import { BROW_LEFT, BROW_RIGHT, scaledPolygon, toPixels, type Landmarks } from "@/lib/image/landmarks";
import { loadCategories, loadImage, loadLandmarks, seamScore } from "./helpers";

// Each sample person's brows photo (makeup-vto brows composited back onto the bald photo) and the bald photo itself.
const BROWS: Record<string, string> = { P1B: "hero__P1B__browsB", P2B: "rec__P2B__browsB", P3B: "rec__P3B__browsB", P4B: "rec__P4B__browsB" };

const cover = async (name: string) => coverMaskFromCategories((await loadCategories(name)).data);

/** Median L* inside the brow outlines (not grown), leaving out covered pixels. */
function browL(im: RawImage, lm: Landmarks, exclude?: Uint8Array): number {
  const W = im.width, H = im.height;
  const m = new Uint8Array(W * H);
  for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(toPixels(lm, W, H), idx, 1), W, H, m);
  const Ls: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i] && !(exclude && exclude[i])) Ls.push(rgbToLab(im.data[i * 3], im.data[i * 3 + 1], im.data[i * 3 + 2])[0]);
  return median(Ls);
}

/** The brows photo warped into the render's frame with the shift removed: what the paste blends towards. */
function alignedBrows(render: RawImage, brows: RawImage, res: BrowsApplied): RawImage {
  const { a, b, tx, ty } = res.transform;
  const W = render.width, H = render.height, out = new Uint8ClampedArray(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(brows.width - 1.001, Math.max(0, a * (x + 0.5) - b * (y + 0.5) + tx - 0.5));
      const sy = Math.min(brows.height - 1.001, Math.max(0, b * (x + 0.5) + a * (y + 0.5) + ty - 0.5));
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      for (let c = 0; c < 3; c++) {
        const p = (yy: number, xx: number) => brows.data[(yy * brows.width + xx) * 3 + c];
        const v = (p(iy, ix) * (1 - fx) + p(iy, ix + 1) * fx) * (1 - fy) + (p(iy + 1, ix) * (1 - fx) + p(iy + 1, ix + 1) * fx) * fy;
        out[(y * W + x) * 3 + c] = v - res.shift[c];
      }
    }
  return { data: out, width: W, height: H };
}

async function run(person: string, render: string) {
  const name = `rec__${person}__${render}`;
  const [r, brows, bald] = await Promise.all([
    loadImage(`fixtures/youcam/${name}.jpg`),
    loadImage(`fixtures/youcam/${BROWS[person]}.jpg`),
    loadImage(`public/personas/${person}.jpg`),
  ]);
  const rl = loadLandmarks(name).landmarks, bl = loadLandmarks(BROWS[person]).landmarks;
  const cv = await cover(name);
  return { r, brows, bald, rl, bl, cv, bald_lm: loadLandmarks(person).landmarks, res: applyBrowsDetailed(r, brows, rl, bl, cv) };
}

describe("fitSimilarity", () => {
  it("recovers a known rotation, scale and shift", () => {
    const src: Point[] = [[10, 20], [200, 35], [120, 180], [40, 90], [160, 110]];
    const a = 1.05 * Math.cos(0.03), b = 1.05 * Math.sin(0.03);
    const dst: Point[] = src.map(([x, y]) => [a * x - b * y + 4.5, b * x + a * y - 7.25]);
    const T = fitSimilarity(src, dst);
    expect(T.a).toBeCloseTo(a, 6);
    expect(T.b).toBeCloseTo(b, 6);
    expect(T.tx).toBeCloseTo(4.5, 4);
    expect(T.ty).toBeCloseTo(-7.25, 4);
  });

  it("refuses degenerate input", () => {
    expect(() => fitSimilarity([[1, 1]], [[2, 2]])).toThrow();
    expect(() => fitSimilarity([[1, 1], [1, 1]], [[2, 2], [3, 3]])).toThrow(/degenerate/);
  });
});

// One wig and one wrap per sample person. Hair-transfer itself redraws brows on some wig renders (made from the bald
// photo, yet darker brows than bald), so the brow check compares with the brows photo, not with the render before.
const CASES = [
  ["P1B", "W01"], ["P1B", "H02"], ["P2B", "W03"], ["P2B", "H01"],
  ["P3B", "W01"], ["P3B", "H01"], ["P4B", "W10"], ["P4B", "H01"],
] as const;

describe("applyBrows on the recorded wig and wrap renders", () => {
  it.each(CASES)("%s x %s: only the brow region changes", async (p, w) => {
    const { r, res } = await run(p, w);
    expect(res.image.width).toBe(r.width);
    expect(res.image.height).toBe(r.height);
    let changedOutside = 0, inMask = 0;
    for (let i = 0; i < res.mask.length; i++) {
      const same = res.image.data[i * 3] === r.data[i * 3] && res.image.data[i * 3 + 1] === r.data[i * 3 + 1] && res.image.data[i * 3 + 2] === r.data[i * 3 + 2];
      if (res.mask[i] === 0) {
        if (!same) changedOutside++;
      } else inMask++;
    }
    expect(changedOutside).toBe(0);
    // The brow region is a small share of the picture (two brows grown 35%, feathered).
    expect(inMask).toBeGreaterThan(0.002 * res.mask.length);
    expect(inMask).toBeLessThan(0.03 * res.mask.length);
  }, 30000);

  it.each(CASES)("%s x %s: the brows end up at least as dark as the brows photo's, and never lighter than the render's", async (p, w) => {
    const { r, brows, bald, rl, bl, cv, bald_lm, res } = await run(p, w);
    const before = browL(r, rl, cv), after = browL(res.image, rl, cv);
    const shiftL = rgbToLab(128 + res.shift[0], 128 + res.shift[1], 128 + res.shift[2])[0] - rgbToLab(128, 128, 128)[0];
    // The brows photo really has brows: its brow area is clearly darker than the bald photo's.
    expect(browL(brows, bl) - browL(bald, bald_lm)).toBeLessThan(-2);
    // Darken only: the render's brow area never gets lighter, and ends at least about as dark as the user's brows
    // (the brows photo's, on the render's skin tone).
    expect(after).toBeLessThanOrEqual(before + 0.25);
    expect(after).toBeLessThan(browL(brows, bl) - shiftL + 2);
  }, 30000);

  it.each(CASES)("%s x %s: no visible seam", async (p, w) => {
    const { r, brows, res } = await run(p, w);
    const s = seamScore(res.image, [r, alignedBrows(r, brows, res)], res.mask);
    expect(s.n).toBeGreaterThan(500);
    expect(s.p999).toBeLessThan(3);
    expect(s.max).toBeLessThan(6);
  }, 30000);

  it("wraps: where hair-transfer drew no brows, the brow area gets darker by about what the brows photo has vs bald", async () => {
    for (const [p, w] of [["P2B", "H01"], ["P3B", "H01"], ["P4B", "H01"], ["P1B", "H02"]] as const) {
      const { r, brows, bald, rl, bl, cv, bald_lm, res } = await run(p, w);
      const added = browL(brows, bl) - browL(bald, bald_lm);
      const got = browL(res.image, rl, cv) - browL(r, rl, cv);
      expect(got).toBeLessThan(-2);
      // Roughly what was added: measured -3.8 of -5.4 (P2), -2.7 of -3.1 (P3), -3.4 of -5.0 (P4), -3.3 of -6.2 (P1) L*.
      // Less than all of it because hair-transfer already darkened the brow area a little on these renders, and the
      // paste is darken-only.
      expect(got).toBeLessThan(0.45 * added);
      expect(got).toBeGreaterThan(added - 1.5);
    }
  }, 60000);
});

describe("applyBrows never paints over hair or a wrap", () => {
  let d: Awaited<ReturnType<typeof run>>;
  beforeAll(async () => {
    d = await run("P2B", "W05"); // a fringe falls over her left brow (more than half of it)
  });

  it("a fringe over the brow stays exactly as it was; the uncovered brow still gets the brows", () => {
    const { r, cv, res, rl } = d;
    const W = r.width, H = r.height;
    const brow = new Uint8Array(W * H);
    for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(toPixels(rl, W, H), idx, 1.35), W, H, brow);
    let coveredInBrow = 0, weighted = 0, changed = 0;
    for (let i = 0; i < cv.length; i++) {
      if (!cv[i]) continue;
      if (brow[i]) coveredInBrow++;
      if (res.mask[i] !== 0) weighted++;
      if (res.image.data[i * 3] !== r.data[i * 3] || res.image.data[i * 3 + 1] !== r.data[i * 3 + 1] || res.image.data[i * 3 + 2] !== r.data[i * 3 + 2]) changed++;
    }
    expect(coveredInBrow).toBeGreaterThan(500);
    expect(weighted).toBe(0);
    expect(changed).toBe(0);
    // The other brow is uncovered: a good part of it is pasted at high weight.
    const right = new Uint8Array(W * H);
    fillPolygon(scaledPolygon(toPixels(rl, W, H), BROW_RIGHT, 1), W, H, right);
    let n = 0, high = 0;
    for (let i = 0; i < right.length; i++) if (right[i]) {
      n++;
      if (res.mask[i] > 0.5) high++;
    }
    expect(high / n).toBeGreaterThan(0.3);
  });

  it("a synthetic cover over one whole brow leaves it untouched", () => {
    const { r, brows, rl, bl } = d;
    const W = r.width, H = r.height;
    const px = toPixels(rl, W, H);
    // A box around the left brow (grown 60%), like a thick fringe.
    const poly = scaledPolygon(px, BROW_LEFT, 1.6);
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
    const fake = new Uint8Array(W * H);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) fake[y * W + x] = 1;
    const res = applyBrowsDetailed(r, brows, rl, bl, fake);
    let weighted = 0, changed = 0;
    for (let i = 0; i < fake.length; i++) {
      if (!fake[i]) continue;
      if (res.mask[i] !== 0) weighted++;
      if (res.image.data[i * 3] !== r.data[i * 3]) changed++;
    }
    expect(weighted).toBe(0);
    expect(changed).toBe(0);
    expect(browL(res.image, rl, fake)).toBeLessThan(browL(r, rl, fake)); // the other brow is still done
  });

  it("without a cover mask the fringe would be painted over (why the browser always passes one)", () => {
    const { r, brows, rl, bl, cv } = d;
    const res = applyBrowsDetailed(r, brows, rl, bl);
    let painted = 0;
    for (let i = 0; i < cv.length; i++) if (cv[i] && res.mask[i] > 0.5) painted++;
    expect(painted).toBeGreaterThan(100);
  });
});

describe("applyBrows input checks", () => {
  it("needs landmarks in both photos and a matching cover mask", async () => {
    const { r, brows, rl, bl } = await run("P3B", "W01");
    expect(() => applyBrows(r, brows, null, bl)).toThrow(/render/);
    expect(() => applyBrows(r, brows, rl, [])).toThrow(/brows photo/);
    expect(() => applyBrows(r, brows, rl, bl, new Uint8Array(10))).toThrow(/size/);
  });
});
