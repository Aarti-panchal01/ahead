import { describe, expect, it } from "vitest";
import { accentFor, applyAccent } from "@/lib/client/accent";
import { SAMPLE_PEOPLE } from "@/lib/client/personas";
import { BACKGROUND, FALLBACK_ACCENT, contrastRatio } from "@/lib/client/stubs";

function fakeStyle() {
  const props: Record<string, string> = {};
  return { props, setProperty: (k: string, v: string) => { props[k] = v; } };
}

describe("accent", () => {
  it("applies --accent and the measured hair colour as CSS variables", () => {
    const s = fakeStyle();
    applyAccent(s, { hex: "#4A4747", source: "#888585", contrast: 5.1, fallback: false });
    expect(s.props).toEqual({ "--accent": "#4A4747", "--hair": "#888585" });
  });

  it("uses the accent for --hair when there is no source colour", () => {
    const s = fakeStyle();
    applyAccent(s, accentFor(undefined));
    expect(s.props["--accent"]).toBe(FALLBACK_ACCENT);
    expect(s.props["--hair"]).toBe(FALLBACK_ACCENT);
  });

  it("falls back to #5B4636 with no hair colour", () => {
    expect(accentFor(undefined)).toMatchObject({ hex: FALLBACK_ACCENT, fallback: true });
    expect(accentFor("not a colour").fallback).toBe(true);
  });

  it.each([...SAMPLE_PEOPLE.map((p) => p.hair), "#AF855E", "#A39A99", "#F0E0C0"])("%s passes 4.5:1 on the background", (hex) => {
    const a = accentFor(hex);
    expect(contrastRatio(a.hex, BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(a.contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a colour that already passes", () => {
    expect(accentFor("#1D1C21").hex).toBe("#1D1C21");
  });

  it("darkens a light grey but keeps it grey", () => {
    const a = accentFor("#888585");
    expect(a.hex).not.toBe("#888585");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(a.hex.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
  });
});
