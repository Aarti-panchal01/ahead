// TEMPORARY stand-ins for the lab agent's lib/image/ (deltaE2000, accentFromHair, contrastRatio,
// sampleColours, integrityCheck). The UI imports these ONLY through this file, so at merge the
// orchestrator replaces the body of this file with re-exports from "@/lib/image" and nothing else changes:
//   export { deltaE2000, accentFromHair, contrastRatio, sampleColours, integrityCheck } from "@/lib/image";
// Until then: CIE76 distance instead of ΔE2000, a naive hair sample, and an integrity check that
// always answers "unchanged". None of these numbers are shown to users as measurements.
import type { AccentColour, IntegrityReport, SampledColours } from "@/lib/types";

export const BACKGROUND = "#F3F5F2";
export const FALLBACK_ACCENT = "#5B4636";

type Lab = { L: number; a: number; b: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

/** STUB: CIE76 distance. The lab agent's version is real ΔE2000. Accepts hex or Lab. */
export function deltaE2000(a: string | Lab, b: string | Lab): number {
  const p = typeof a === "string" ? hexToLab(a) : a;
  const q = typeof b === "string" ? hexToLab(b) : b;
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** STUB: hair colour -> accent that passes 4.5:1 on the background (darkened step by step, same hue). */
export function accentFromHair(hairHex?: string): AccentColour {
  if (!hairHex || !/^#[0-9a-f]{6}$/i.test(hairHex)) {
    return { hex: FALLBACK_ACCENT, contrast: contrastRatio(FALLBACK_ACCENT, BACKGROUND), fallback: true };
  }
  let [r, g, b] = hexToRgb(hairHex);
  let hex = rgbToHex(r, g, b);
  for (let i = 0; i < 40 && contrastRatio(hex, BACKGROUND) < 4.5; i++) {
    [r, g, b] = [r * 0.94, g * 0.94, b * 0.94];
    hex = rgbToHex(r, g, b);
  }
  return { hex, source: hairHex.toUpperCase(), contrast: contrastRatio(hex, BACKGROUND), fallback: false };
}

/** STUB: median colour of the top-centre band of the photo. The lab agent's version uses face landmarks. */
export function sampleColours(image: { data: Uint8ClampedArray; width: number; height: number }): SampledColours {
  const { data, width, height } = image;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = Math.floor(height * 0.04); y < Math.floor(height * 0.16); y++) {
    for (let x = Math.floor(width * 0.3); x < Math.floor(width * 0.7); x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
  }
  if (!rs.length) return { hairPixels: 0, browPixels: 0 };
  const med = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
  return { hair: rgbToHex(med(rs), med(gs), med(bs)), hairPixels: rs.length, browPixels: 0 };
}

/** STUB: always "unchanged". The lab agent's version measures cheeks, nose bridge and chin in Lab. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub keeps the real signature
export async function integrityCheck(_original: string, _render: string): Promise<IntegrityReport> {
  return { status: "unchanged", regions: [], plainText: "Skin tone check: unchanged" };
}
