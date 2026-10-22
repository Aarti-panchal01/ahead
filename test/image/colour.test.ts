import { describe, expect, it } from "vitest";
import {
  BACKGROUND,
  FALLBACK_ACCENT,
  accentFromHair,
  contrastRatio,
  deltaE2000,
  hexToLab,
  hexToRgb,
  isHex,
  labToHex,
  rgbToHex,
  rgbToLab,
  type Lab,
} from "@/lib/image/colour";

// Sharma, Wu and Dalal (2005), Table 1: CIEDE2000 test data (pair number, Lab 1, Lab 2, ΔE00).
const SHARMA: [number, Lab, Lab, number][] = [
  [1, [50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [2, [50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [3, [50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [7, [50, 0, 0], [50, -1, 2], 2.3669],
  [13, [50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [15, [50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [17, [50, 2.5, 0], [73, 25, -18], 27.1492],
  [22, [50, 2.5, 0], [50, 3.1736, 0.5854], 1.0],
  [25, [60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [26, [63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [31, [22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [34, [2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe("deltaE2000", () => {
  it.each(SHARMA)("matches Sharma et al. 2005 pair %i", (_n, a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 4); // symmetric
  });

  it("is 0 for identical colours and accepts hex strings", () => {
    expect(deltaE2000("#5B4636", "#5B4636")).toBe(0);
    expect(deltaE2000("#000000", "#FFFFFF")).toBeCloseTo(100, 0);
  });
});

describe("sRGB and CIELAB", () => {
  it("maps white, black and mid grey to the right L*", () => {
    const w = rgbToLab(255, 255, 255), k = rgbToLab(0, 0, 0), g = rgbToLab(119, 119, 119);
    expect(w[0]).toBeCloseTo(100, 2);
    expect(Math.abs(w[1]) + Math.abs(w[2])).toBeLessThan(0.01);
    expect(k[0]).toBeCloseTo(0, 5);
    expect(g[0]).toBeCloseTo(50, 0);
  });

  it("round-trips hex through Lab", () => {
    for (const hex of ["#5B4636", "#F3F5F2", "#1E2A2A", "#2F6F5E", "#A86B12", "#E8D8B0", "#101010", "#FF0000"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  it("parses and formats hex", () => {
    expect(hexToRgb("#abc")).toEqual([170, 187, 204]);
    expect(hexToRgb("5b4636")).toEqual([91, 70, 54]);
    expect(rgbToHex(91, 70, 54)).toBe("#5B4636");
    expect(isHex("#12345")).toBe(false);
    expect(isHex(undefined)).toBe(false);
    expect(() => hexToRgb("brown")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio(BACKGROUND, BACKGROUND)).toBe(1);
  });

  it("gives the palette ink a pass on the background", () => {
    expect(contrastRatio("#1E2A2A", BACKGROUND)).toBeGreaterThan(4.5);
  });
});

describe("accentFromHair", () => {
  it("falls back to #5B4636 with no or unreadable input", () => {
    for (const input of [undefined, "", "not a colour"]) {
      const a = accentFromHair(input);
      expect(a.hex).toBe(FALLBACK_ACCENT);
      expect(a.fallback).toBe(true);
      expect(a.contrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("darkens very light hair (#E8D8B0) until it passes 4.5:1, keeping its hue", () => {
    const a = accentFromHair("#E8D8B0");
    expect(a.fallback).toBe(false);
    expect(a.source).toBe("#E8D8B0");
    expect(a.contrast).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(a.hex, BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    const [L0, a0, b0] = hexToLab("#E8D8B0"), [L1, a1, b1] = hexToLab(a.hex);
    expect(L1).toBeLessThan(L0);
    const hue = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
    expect(Math.abs(hue(a1, b1) - hue(a0, b0))).toBeLessThan(10);
  });

  it("keeps very dark hair (#101010) as it is, it already passes", () => {
    const a = accentFromHair("#101010");
    expect(a.hex).toBe("#101010");
    expect(a.contrast).toBeGreaterThanOrEqual(4.5);
    expect(a.fallback).toBe(false);
  });

  it("changes a mid colour only as much as needed", () => {
    const a = accentFromHair("#A08060"); // light brown, fails on the background
    expect(contrastRatio("#A08060", BACKGROUND)).toBeLessThan(4.5);
    expect(a.contrast).toBeGreaterThanOrEqual(4.5);
    expect(a.contrast).toBeLessThan(4.9);
  });
});
