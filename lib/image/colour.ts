// Colour science for Ahead: sRGB <-> CIELAB (D65), CIEDE2000, WCAG contrast, and the hair-colour accent.
// Pure functions, no DOM. The UI imports deltaE2000, accentFromHair and contrastRatio from here.

import type { AccentColour } from "@/lib/types";

/** CIELAB triple [L*, a*, b*] (D65 white). */
export type Lab = readonly [number, number, number];

/** App background (CLAUDE.md palette). */
export const BACKGROUND = "#F3F5F2";
/** Accent when no hair colour can be read (CLAUDE.md). */
export const FALLBACK_ACCENT = "#5B4636";
/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5;

const WHITE = [0.95047, 1, 1.08883] as const;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB byte -> linear light, as a lookup table (used per pixel). */
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** sRGB bytes (0..255) to CIELAB. Non-integer inputs are rounded. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = LINEAR[clampByte(r)], G = LINEAR[clampByte(g)], B = LINEAR[clampByte(b)];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / WHITE[0];
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / WHITE[2];
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB to sRGB bytes, clipped to the sRGB gamut. */
export function labToRgb(lab: Lab): [number, number, number] {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
  const x = inv(fx) * WHITE[0];
  const y = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
  const z = inv(fz) * WHITE[2];
  const lin = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const out = lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
    return clampByte(v * 255);
  });
  return [out[0], out[1], out[2]];
}

export function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** True for "#RRGGBB" or "#RGB" (the # is optional). */
export function isHex(hex: unknown): hex is string {
  return typeof hex === "string" && HEX.test(hex.trim());
}

/** "#RRGGBB" (or "#RGB") to [r, g, b] bytes. Throws on anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex.trim());
  if (!m) throw new Error(`Not a hex colour: ${hex}`);
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r, g, b] bytes to "#RRGGBB" (upper case). */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function labToHex(lab: Lab): string {
  const [r, g, b] = labToRgb(lab);
  return rgbToHex(r, g, b);
}

const toLab = (c: Lab | string): Lab => (typeof c === "string" ? hexToLab(c) : c);
const RAD = Math.PI / 180;
const POW25_7 = 25 ** 7;

/**
 * CIEDE2000 colour difference (kL = kC = kH = 1), after Sharma, Wu and Dalal (2005),
 * "The CIEDE2000 color-difference formula: implementation notes, supplementary test data, and mathematical observations".
 * Accepts Lab triples or "#RRGGBB" strings.
 */
export function deltaE2000(c1: Lab | string, c2: Lab | string): number {
  const [L1, a1, b1] = toLab(c1);
  const [L2, a2, b2] = toLab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0;
    const h = Math.atan2(b, ap) / RAD;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p), h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * RAD) +
    0.24 * Math.cos(2 * hbarp * RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * RAD) -
    0.2 * Math.cos((4 * hbarp - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const Lm = (Lbarp - 50) ** 2;
  const Sl = 1 + (0.015 * Lm) / Math.sqrt(20 + Lm);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc;
  const l = dLp / Sl, c = dCp / Sc, h = dHp / Sh;
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
}

/** WCAG 2 relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/** WCAG 2 contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA), lb = relativeLuminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The app accent from the user's measured hair colour (CLAUDE.md "the one bold thing").
 * If it fails 4.5:1 on the background, move L* (same a*, b*) the shortest way, darker or lighter, until it passes.
 * No (or unreadable) hair colour: the fallback #5B4636.
 */
export function accentFromHair(hairHex?: string, background: string = BACKGROUND): AccentColour {
  if (!isHex(hairHex)) {
    return { hex: FALLBACK_ACCENT, contrast: contrastRatio(FALLBACK_ACCENT, background), fallback: true };
  }
  const source = rgbToHex(...hexToRgb(hairHex));
  const direct = contrastRatio(source, background);
  if (direct >= MIN_CONTRAST) return { hex: source, source, contrast: direct, fallback: false };

  const [L, a, b] = hexToLab(source);
  for (let step = 0.5; step <= 100; step += 0.5) {
    for (const Lt of [L - step, L + step]) {
      if (Lt < 0 || Lt > 100) continue;
      const hex = labToHex([Lt, a, b]);
      const contrast = contrastRatio(hex, background);
      if (contrast >= MIN_CONTRAST) return { hex, source, contrast, fallback: false };
    }
  }
  // Unreachable on any real background (black or white always passes against one side), but stay safe.
  return { hex: FALLBACK_ACCENT, source, contrast: contrastRatio(FALLBACK_ACCENT, background), fallback: true };
}
