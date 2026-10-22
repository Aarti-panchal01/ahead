import { describe, expect, it } from "vitest";
import {
  channelsOf,
  clipHalfPlane,
  convexHull,
  fillPolygon,
  gaussianBlur,
  gaussianBlurBox,
  median,
  percentile,
  rampPolygon,
  resize,
  resizeMask,
  type Point,
  type RawImage,
} from "@/lib/image/raw";
import { FACE_OVAL, hasFace, skinSamplePoints, toPixels, faceWidth } from "@/lib/image/landmarks";
import { loadLandmarks } from "./helpers";

const flat = (w: number, h: number, rgb: [number, number, number], ch: 3 | 4 = 3): RawImage => {
  const data = new Uint8ClampedArray(w * h * ch);
  for (let i = 0; i < w * h; i++) {
    data.set(rgb, i * ch);
    if (ch === 4) data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
};

describe("raw pixel helpers", () => {
  it("knows RGB from RGBA and rejects anything else", () => {
    expect(channelsOf(flat(2, 2, [1, 2, 3]))).toBe(3);
    expect(channelsOf(flat(2, 2, [1, 2, 3], 4))).toBe(4);
    expect(() => channelsOf({ data: new Uint8ClampedArray(8), width: 2, height: 2 })).toThrow();
  });

  it("resizes a flat colour to the same flat colour, up and down, keeping channels", () => {
    for (const [w, h] of [[37, 23], [3, 5], [200, 120]]) {
      const out = resize(flat(91, 61, [91, 70, 54], 4), w, h);
      expect(out.width).toBe(w);
      expect(out.data.length).toBe(w * h * 4);
      expect(new Set(out.data).size).toBeLessThanOrEqual(4);
      expect([...out.data.slice(0, 4)]).toEqual([91, 70, 54, 255]);
    }
  });

  it("averages when downscaling (no aliasing on a 1-px checkerboard)", () => {
    const img = { data: new Uint8ClampedArray(64 * 64 * 3), width: 64, height: 64 };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) img.data.fill((x + y) % 2 ? 255 : 0, (y * 64 + x) * 3, (y * 64 + x) * 3 + 3);
    const out = resize(img, 16, 16);
    for (let i = 0; i < out.data.length; i++) expect(Math.abs(out.data[i] - 127.5)).toBeLessThan(20);
  });

  it("fills a polygon by pixel centres", () => {
    const m = fillPolygon([[2, 2], [8, 2], [8, 6], [2, 6]], 10, 10);
    expect(m.reduce((s, v) => s + v, 0)).toBe(24);
    expect(m[3 * 10 + 1]).toBe(0);
    expect(m[3 * 10 + 2]).toBe(1);
  });

  it("builds a convex hull and clips it with a half-plane", () => {
    const pts: Point[] = [[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]];
    const hull = convexHull(pts);
    expect(hull).toHaveLength(4);
    const clipped = clipHalfPlane(hull, [0, 1], [0, 1]); // keep y >= 1
    expect(Math.min(...clipped.map((p) => p[1]))).toBeCloseTo(1, 9);
    expect(clipped).toHaveLength(4);
  });

  it("ramps a polygon mask: 0 outside, smooth inside, 1 deep inside", () => {
    const a = rampPolygon([[10, 10], [50, 10], [50, 50], [10, 50]], 60, 60, 8);
    expect(a[5 * 60 + 5]).toBe(0);
    expect(a[30 * 60 + 30]).toBe(1);
    const edge = a[30 * 60 + 10], mid = a[30 * 60 + 14];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.05);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it("blurs without changing the total much", () => {
    const m = new Float32Array(50 * 50);
    m[25 * 50 + 25] = 1;
    const b = gaussianBlur(m, 50, 50, 2);
    expect(b.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 4);
    expect(b[25 * 50 + 25]).toBeLessThan(0.1);
  });

  it("resizes masks with nearest neighbour (no new values)", () => {
    const m = new Uint8Array([0, 1, 2, 3]);
    const r = resizeMask(m, 2, 2, 5, 3);
    expect(r.length).toBe(15);
    expect(new Set(r)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("takes medians and percentiles like numpy", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([0, 10, 20, 30, 40], 10)).toBe(4);
    expect(median([])).toBeNaN();
  });
});

describe("fast paths match the plain versions", () => {
  // A pseudo-random mask with blobs, including at the image edges.
  const W = 97, H = 83;
  const mask = new Uint8Array(W * H);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 12; n++) {
    const cx = rnd() * W, cy = rnd() * H, r = 2 + rnd() * 9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) mask[y * W + x] = 1;
  }

  it.each([0.6, 2.5, 7])("gaussianBlurBox equals gaussianBlur inside the box (sigma %s)", (sigma) => {
    const full = gaussianBlur(Float32Array.from(mask), W, H, sigma);
    for (const box of [{ x0: 10, y0: 5, x1: 60, y1: 40 }, { x0: -5, y0: -5, x1: 30, y1: 200 }, { x0: 0, y0: 0, x1: W, y1: H }]) {
      const b = gaussianBlurBox(mask, W, H, sigma, box);
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) expect(b.data[y * b.w + x]).toBeCloseTo(full[(y + b.y0) * W + x + b.x0], 5);
    }
  });

  it("rampPolygon (edge-skipping) equals the brute-force distance ramp", () => {
    const poly: Point[] = [[5.5, 8], [70, 3], [90, 40], [60, 78], [12, 66], [30, 40]];
    const ramp = 9;
    const a = rampPolygon(poly, W, H, ramp);
    const inside = fillPolygon(poly, W, H);
    const seg = (px: number, py: number, p: Point, q: Point) => {
      const vx = q[0] - p[0], vy = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((px - p[0]) * vx + (py - p[1]) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(px - (p[0] + t * vx), py - (p[1] + t * vy));
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!inside[i]) {
          expect(a[i]).toBe(0);
          continue;
        }
        let d = Infinity;
        for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) d = Math.min(d, seg(x + 0.5, y + 0.5, poly[j], poly[k]));
        const t = Math.min(1, d / ramp);
        expect(a[i]).toBeCloseTo(t * t * (3 - 2 * t), 5);
      }
  });
});

describe("landmarks", () => {
  const { width, height, landmarks } = loadLandmarks("F1");

  it("recognises a full face mesh and rejects missing ones", () => {
    expect(hasFace(landmarks)).toBe(true);
    expect(hasFace(null)).toBe(false);
    expect(hasFace(landmarks.slice(0, 100))).toBe(false);
  });

  it("places skin samples inside the face outline, chin above the jaw edge", () => {
    const px = toPixels(landmarks, width, height);
    const oval = fillPolygon(FACE_OVAL.map((i) => px[i]), width, height);
    const fw = faceWidth(px);
    expect(fw).toBeGreaterThan(300);
    const s = skinSamplePoints(px);
    for (const p of Object.values(s)) expect(oval[Math.round(p[1]) * width + Math.round(p[0])]).toBe(1);
    expect(px[152][1] - s.chin[1]).toBeGreaterThan(0.08 * fw); // patch (radius 4%) stays off the jaw edge
    expect(s.cheek_left[0]).toBeLessThan(s.cheek_right[0]); // image left/right
  });
});
