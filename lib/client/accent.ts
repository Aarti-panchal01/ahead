// The one bold thing (CLAUDE.md, Design): the user's hair colour becomes --accent across the app.
import type { AccentColour } from "@/lib/types";
import { accentFromHair } from "./image";

interface StyleTarget { setProperty(name: string, value: string): void }

/** Writes --accent (and its source colour, for the swatch) onto a style target, e.g. document.documentElement.style. */
export function applyAccent(style: StyleTarget, accent: AccentColour): void {
  style.setProperty("--accent", accent.hex);
  style.setProperty("--hair", accent.source ?? accent.hex);
}

export function accentFor(hairHex?: string): AccentColour {
  return accentFromHair(hairHex);
}
