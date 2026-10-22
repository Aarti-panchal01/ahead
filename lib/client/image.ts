// The UI's single doorway to the image lab (lib/image). Everything here is real: ΔE2000, the 4.5:1 accent
// guard, local hair/brow sampling with MediaPipe, and the integrity check on every render (CLAUDE.md core rule).
// Kept as one file so the UI never imports lib/image directly and the shapes stay UI-friendly.
import { hexToLab as labTuple } from "@/lib/image/colour";
import type { IntegrityReport, SampledColours } from "@/lib/types";

export { BACKGROUND, FALLBACK_ACCENT, accentFromHair, contrastRatio, deltaE2000 } from "@/lib/image/colour";

/** Lab as an object, which the ranking code reads by name. */
export function hexToLab(hex: string): { L: number; a: number; b: number } {
  const [L, a, b] = labTuple(hex);
  return { L, a, b };
}

/** Hair and brow colour from the user's own photo, locally (0 units). Browser only. */
export async function sampleColours(image: ImageData): Promise<SampledColours> {
  const { sampleColoursInBrowser } = await import("@/lib/image/browser");
  return sampleColoursInBrowser(image);
}

/** Measures cheeks, nose bridge and chin against the original; corrects above ΔE2000 2. Browser only. */
export async function integrityCheck(originalUrl: string, renderUrl: string): Promise<IntegrityReport> {
  try {
    const { checkRender } = await import("@/lib/image/browser");
    return await checkRender(originalUrl, renderUrl);
  } catch {
    // Models failed to load or the image couldn't be read: say so, never claim "unchanged".
    return { status: "failed", regions: [], plainText: "Skin tone check: couldn't run on this device" };
  }
}

/**
 * Puts the brows from her brows photo onto a wig or wrap render (lab's applyBrowsInBrowser). Returns a data URL.
 * On any failure (models, face not found, helper missing before lab's branch is merged) returns the plain render,
 * so a card never breaks; the caller then shows it without brows.
 */
export async function applyBrows(renderUrl: string, browsUrl: string): Promise<string> {
  try {
    const mod = (await import("@/lib/image/browser")) as unknown as {
      applyBrowsInBrowser?: (render: string, brows: string) => Promise<string>;
    };
    if (typeof mod.applyBrowsInBrowser !== "function") return renderUrl;
    return await mod.applyBrowsInBrowser(renderUrl, browsUrl);
  } catch {
    return renderUrl;
  }
}

/**
 * The square with the most hair in a 0/1 hair mask (summed-area table, so it stays fast at 1024 px).
 * Returns null when no square is at least `minFill` hair: then we don't show a "your hair" crop at all.
 */
export function hairCropBox(mask: ArrayLike<number>, width: number, height: number, minFill = 0.9): { x: number; y: number; size: number } | null {
  const size = Math.max(24, Math.round(0.1 * Math.max(width, height)));
  if (size > width || size > height) return null;
  const W = width + 1;
  const sat = new Uint32Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x] ? 1 : 0;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const sum = (x: number, y: number) => sat[(y + size) * W + x + size] - sat[y * W + x + size] - sat[(y + size) * W + x] + sat[y * W + x];
  const stride = Math.max(1, Math.round(size / 4));
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + size <= height; y += stride)
    for (let x = 0; x + size <= width; x += stride) {
      const s = sum(x, y);
      if (s > best) { best = s; bx = x; by = y; }
    }
  return best >= minFill * size * size ? { x: bx, y: by, size } : null;
}

/** A small crop of the user's real hair, for the match card. Undefined when there isn't enough hair to show. */
export async function hairCrop(photoUrl: string): Promise<string | undefined> {
  try {
    const { readFace, toDataUrl } = await import("@/lib/image/browser");
    const f = await readFace(photoUrl);
    const box = hairCropBox(f.hairMask, f.image.width, f.image.height);
    if (!box) return undefined;
    const { x, y, size } = box;
    const ch = f.image.data.length / (f.image.width * f.image.height);
    const out = new Uint8ClampedArray(size * size * ch);
    for (let r = 0; r < size; r++) {
      const from = ((y + r) * f.image.width + x) * ch;
      out.set(f.image.data.subarray(from, from + size * ch), r * size * ch);
    }
    return await toDataUrl({ data: out, width: size, height: size });
  } catch {
    return undefined;
  }
}
