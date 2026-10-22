import { describe, expect, it } from "vitest";
import { browDefault, hairMaskFromCategories, sampleColours, SAMPLING } from "@/lib/image/sample";
import { accentFromHair, contrastRatio, BACKGROUND, deltaE2000, hexToLab } from "@/lib/image/colour";
import { patchLab } from "@/lib/image/integrity";
import { CHEEK_LEFT, faceWidth, toPixels } from "@/lib/image/landmarks";
import { loadCategories, loadImage, loadLandmarks } from "./helpers";

async function read(face: string, image: string) {
  const [photo, cats] = await Promise.all([loadImage(image), loadCategories(face)]);
  const { landmarks } = loadLandmarks(face);
  return { photo, landmarks, hairMask: hairMaskFromCategories(cats.data) };
}

describe("sampleColours", () => {
  it.each([1, 2, 3, 4])("reads hair and brows on F%i: brows darker than the cheek, enough pixels", async (F) => {
    const { photo, landmarks, hairMask } = await read(`F${F}`, `assets/ai/faces/F${F}.jpg`);
    const s = sampleColours(photo, landmarks, hairMask);
    expect(s.hair).toMatch(/^#[0-9A-F]{6}$/);
    expect(s.brows).toMatch(/^#[0-9A-F]{6}$/);
    expect(s.hairPixels).toBeGreaterThan(100_000);
    expect(s.browPixels).toBeGreaterThan(500);
    const px = toPixels(landmarks, photo.width, photo.height);
    const cheek = patchLab(photo, px[CHEEK_LEFT], 0.04 * faceWidth(px))!;
    expect(hexToLab(s.brows!)[0]).toBeLessThan(cheek[0] - SAMPLING.minBrowContrast);
    // The accent made from it always passes on the background.
    expect(contrastRatio(accentFromHair(s.hair).hex, BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("tells light-brown hair (F1) from black hair (F2, F4)", async () => {
    const L = async (F: number) => {
      const { photo, landmarks, hairMask } = await read(`F${F}`, `assets/ai/faces/F${F}.jpg`);
      return hexToLab(sampleColours(photo, landmarks, hairMask).hair!)[0];
    };
    const [l1, l2, l4] = await Promise.all([L(1), L(2), L(4)]);
    expect(l1).toBeGreaterThan(l2 + 15);
    expect(l1).toBeGreaterThan(l4 + 15);
    expect(l2).toBeLessThan(25);
  });

  it("reads no hair on a bald head (too few hair pixels) but still reads the brows", async () => {
    const { photo, landmarks, hairMask } = await read("hero__P1B", "fixtures/youcam/hero__P1B.jpg");
    const s = sampleColours(photo, landmarks, hairMask);
    expect(s.hair).toBeUndefined();
    expect(s.hairPixels).toBeLessThan(2000);
    expect(s.brows).toBeDefined();
    expect(accentFromHair(s.hair).fallback).toBe(true);
  });

  it("reads nothing without landmarks or a mask, and checks the mask size", async () => {
    const { photo, hairMask } = await read("F1", "assets/ai/faces/F1.jpg");
    expect(sampleColours(photo, null, null)).toEqual({ hairPixels: 0, browPixels: 0 });
    expect(sampleColours(photo, null, hairMask).hair).toBeDefined(); // hair alone still works
    expect(() => sampleColours(photo, null, new Uint8Array(5))).toThrow(/size/);
  });
});

describe("browDefault", () => {
  it("is about 10 L* darker with the same hue", () => {
    for (const hex of ["#906C5C", "#5C4135", "#9B786C", "#3A2A22"]) {
      const [L0, a0, b0] = hexToLab(hex);
      const d = browDefault(hex);
      const [L1, a1, b1] = hexToLab(d);
      expect(L0 - L1).toBeGreaterThan(9);
      expect(L0 - L1).toBeLessThan(11);
      expect(Math.abs(Math.atan2(b1, a1) - Math.atan2(b0, a0))).toBeLessThan(0.1);
      expect(deltaE2000(hex, d)).toBeGreaterThan(5);
    }
  });

  it("never goes below black", () => {
    expect(browDefault("#050505")).toBe("#000000");
  });
});
