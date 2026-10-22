// Brows on by default when her hair is gone (sample people: brows render recorded at her own brow colour,
// composited, skin unchanged). Each wig or wrap render gets the brows put on in the browser (lab's applyBrows),
// and that version is checked against the brows photo, because the brows were added on purpose.
// Pure, so it is tested.
import type { HairLossStage, IntegrityReport } from "@/lib/types";
import { shownImage, type RenderState } from "./renderState";

/** Brows are offered for sample people whose hair is gone. An own photo would need a paid brows render first. */
export function browsAvailable(photoKind: "sample" | "own", stage: HairLossStage): boolean {
  return photoKind === "sample" && stage === "gone";
}

/** The toggle says exactly what tapping it does. */
export function browsToggleLabel(on: boolean): string {
  return on ? "Show without brows" : "Show with brows";
}

/** The brows version of one card's render. */
export type BrowsLayer =
  | { status: "adding" }
  | { status: "checking"; image: string }
  | { status: "done"; image: string; report: IntegrityReport }
  /** Brows could not be put on this render; the card shows it without, and says so. */
  | { status: "failed" };

export interface CardView {
  /** The image to show, or undefined while there is nothing to show yet. */
  src?: string;
  /** The integrity result for exactly that image. */
  report?: IntegrityReport;
  checking: boolean;
  /** True when the image shown carries the brows. */
  withBrows: boolean;
  /** Plain words about the brows on this card, when they are on but not shown yet or failed. */
  browsNote?: string;
}

/** What one card shows, given its render, its brows layer and the toggle. */
export function cardView(state: RenderState, layer: BrowsLayer | undefined, browsOn: boolean): CardView {
  const plain: CardView = {
    src: shownImage(state),
    report: state.phase === "done" ? state.report : undefined,
    checking: state.phase === "checking",
    withBrows: false,
  };
  if (!browsOn || state.phase === "idle" || state.phase === "running" || state.phase === "error") return plain;
  if (!layer || layer.status === "adding") return { ...plain, browsNote: "Adding her brows to this one" };
  if (layer.status === "failed") return { ...plain, browsNote: "We couldn't add the brows to this one, so it shows without." };
  if (layer.status === "checking") return { src: layer.image, checking: true, withBrows: true };
  return { src: layer.report.correctedImage ?? layer.image, report: layer.report, checking: false, withBrows: true };
}
