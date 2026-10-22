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
