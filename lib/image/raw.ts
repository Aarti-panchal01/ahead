// Raw pixel helpers for the image lab. No DOM: works the same in the browser and in Node (tests).

/** Interleaved 8-bit pixels, RGB (3 channels) or RGBA (4). The channel count is data.length / (width * height). */
export interface RawImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** A RawImage this module made (always a Uint8ClampedArray). */
export interface RawImageOut extends RawImage {
  data: Uint8ClampedArray;
}

export type Point = readonly [number, number];

export function channelsOf(img: RawImage): 3 | 4 {
  const n = img.width * img.height;
  if (!(n > 0)) throw new Error("Empty image");
  const c = img.data.length / n;
  if (c !== 3 && c !== 4) throw new Error(`Expected RGB or RGBA pixels, got ${c} channels`);
  return c;
}

/**
 * Resize with a separable triangle (bilinear) filter whose support grows with the scale factor,
 * so downscaling averages instead of aliasing (like PIL's antialiased BILINEAR). Keeps the channel count.
 */
export function resize(img: RawImage, width: number, height: number): RawImageOut {
  const ch = channelsOf(img);
  if (width === img.width && height === img.height) {
    return { data: new Uint8ClampedArray(img.data), width, height };
  }
  const xs = weights(img.width, width);
  const ys = weights(img.height, height);
  const tmp = new Float32Array(width * img.height * ch);
  for (let y = 0; y < img.height; y++) {
    const row = y * img.width;
    for (let x = 0; x < width; x++) {
      const { start, w } = xs[x];
      const o = (y * width + x) * ch;
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let k = 0; k < w.length; k++) s += w[k] * img.data[(row + start + k) * ch + c];
        tmp[o + c] = s;
      }
    }
  }
  const out = new Uint8ClampedArray(width * height * ch);
  for (let y = 0; y < height; y++) {
    const { start, w } = ys[y];
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * ch;
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let k = 0; k < w.length; k++) s += w[k] * tmp[((start + k) * width + x) * ch + c];
        out[o + c] = s; // Uint8ClampedArray rounds and clamps
      }
    }
  }
  return { data: out, width, height };
}

function weights(srcLen: number, dstLen: number): { start: number; w: Float32Array }[] {
  const scale = srcLen / dstLen;
  const support = Math.max(1, scale);
  const out: { start: number; w: Float32Array }[] = [];
  for (let i = 0; i < dstLen; i++) {
    const centre = (i + 0.5) * scale - 0.5;
    const lo = Math.max(0, Math.floor(centre - support));
    const hi = Math.min(srcLen - 1, Math.ceil(centre + support));
    const w = new Float32Array(hi - lo + 1);
    let sum = 0;
    for (let j = lo; j <= hi; j++) {
      const v = Math.max(0, 1 - Math.abs(j - centre) / support);
      w[j - lo] = v;
      sum += v;
    }
    if (sum === 0) {
      w.fill(0);
      w[Math.min(w.length - 1, Math.max(0, Math.round(centre) - lo))] = 1;
    } else for (let k = 0; k < w.length; k++) w[k] /= sum;
    out.push({ start: lo, w });
  }
  return out;
}

/** Separable Gaussian blur of a single-channel float mask (edges clamped). sigma in pixels. */
export function gaussianBlur(mask: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (!(sigma > 0)) return Float32Array.from(mask);
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= width ? width - 1 : x + i;
        s += k[i + r] * mask[row + xx];
      }
      tmp[row + x] = s;
    }
  }
  const out = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= height ? height - 1 : y + i;
        s += k[i + r] * tmp[yy * width + x];
      }
      out[y * width + x] = s;
    }
  }
  return out;
}

/** Fill a polygon (even-odd rule, pixel centres) into a 0/1 mask. */
export function fillPolygon(pts: readonly Point[], width: number, height: number, into?: Uint8Array): Uint8Array {
  const mask = into ?? new Uint8Array(width * height);
  if (pts.length < 3) return mask;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(height - 1, Math.ceil(y1));
  const xsCross: number[] = [];
  for (let y = ys; y <= ye; y++) {
    const cy = y + 0.5;
    xsCross.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > cy !== yj > cy) xsCross.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
    }
    xsCross.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xsCross.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xsCross[k] - 0.5)), xb = Math.min(width - 1, Math.floor(xsCross[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/** Convex hull (Andrew's monotone chain), counter-clockwise in image coordinates' math sense. */
export function convexHull(points: readonly Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Keep the part of a polygon where (p - origin) . normal >= 0 (Sutherland-Hodgman against one line). */
export function clipHalfPlane(poly: readonly Point[], origin: Point, normal: Point): Point[] {
  const side = (p: Point) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * Soft polygon mask: 0 outside, rising smoothly (smoothstep) from 0 at the edge to 1 at `ramp` px inside.
 * Nothing leaks outside the polygon, so whatever is beyond the edge (a wig, a wrap) stays exactly as it was.
 */
export function rampPolygon(poly: readonly Point[], width: number, height: number, ramp: number): Float32Array {
  const inside = fillPolygon(poly, width, height);
  const alpha = new Float32Array(width * height);
  const n = poly.length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!inside[i]) continue;
      const px = x + 0.5, py = y + 0.5;
      let d = Infinity;
      for (let k = 0, j = n - 1; k < n; j = k++) {
        d = Math.min(d, segmentDistance(px, py, poly[j], poly[k]));
        if (d === 0) break;
      }
      const t = Math.min(1, d / ramp);
      alpha[i] = t * t * (3 - 2 * t);
    }
  }
  return alpha;
}

function segmentDistance(px: number, py: number, a: Point, b: Point): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

/** Nearest-neighbour resize of a single-channel mask (category or 0/1 masks must not be interpolated). */
export function resizeMask(mask: Uint8Array, width: number, height: number, toWidth: number, toHeight: number): Uint8Array {
  if (mask.length !== width * height) throw new Error("Mask size does not match its dimensions");
  if (width === toWidth && height === toHeight) return mask;
  const out = new Uint8Array(toWidth * toHeight);
  for (let y = 0; y < toHeight; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / toHeight));
    for (let x = 0; x < toWidth; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / toWidth));
      out[y * toWidth + x] = mask[sy * width + sx];
    }
  }
  return out;
}

/** Median of a numeric array (copies; NaN if empty). */
export function median(values: ArrayLike<number>): number {
  return percentile(values, 50);
}

/** Linear-interpolated percentile (0..100) like numpy's default. NaN if empty. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const s = Float64Array.from(values).sort();
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
