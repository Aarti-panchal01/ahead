// Shared types for Ahead. Server routes, the YouCam client and the UI all speak these.

export type CatalogueKind = "wig" | "wrap";

export interface CatalogueItem {
  id: string;
  kind: CatalogueKind;
  name: string;
  /** Public path of the reference photo, e.g. "/catalogue/W1.jpg". */
  image: string;
  /** Approximate colour of the hair or fabric, "#RRGGBB". */
  colour: string;
  /** Wigs: "pixie" | "chin" | "shoulder" | "long". Wraps: "n/a". */
  length: string;
  /** Wigs: "straight" | "wavy" | "curly" | "coily". Wraps: the style, e.g. "head wrap", "beanie". */
  texture: string;
  /** Hair-transfer needs a person wearing the item. Mannequin and flat photos fail with error_no_face. */
  reference: "on-model" | "mannequin" | "flat";
  /** False when YouCam cannot use this photo as a reference (see docs/api-truth-table.md). */
  usableAsReference: boolean;
  /** Wigs only: the demo persona this wig was chosen for. */
  matches?: "P1" | "P2" | "P3" | "P4";
  "AI-generated": true;
}

export type TryOnStatus = "running" | "success" | "error";

export interface TryOnJob {
  /** Task id returned to the browser. Mock ids start with "mock:". */
  id: string;
  itemId: string;
  mode: "mock" | "live";
  createdAt: string;
  /** True when this is a saved recording rather than a fresh YouCam render (mock mode, cap or reserve reached). */
  recording?: boolean;
  /** Why a recording was served instead of a live call, e.g. "daily_cap", "reserve". */
  reason?: string;
}

export interface TryOnResult {
  id: string;
  status: TryOnStatus;
  /** Present on success: where the browser can load the render. */
  resultUrl?: string;
  /** YouCam error code, e.g. "error_no_face". Errors cost 0 units. */
  errorCode?: string;
  /** Plain words for the user: what happened and what to do next. */
  message?: string;
  unitsCharged?: number;
  /** True when the result is a saved recording, labelled as such in the UI. */
  recording?: boolean;
}

export type IntegrityRegion = "cheek_left" | "cheek_right" | "nose_bridge" | "chin";

export interface IntegrityRegionResult {
  region: IntegrityRegion;
  deltaE2000: number;
  deltaL: number;
}

export interface IntegrityReport {
  status: "unchanged" | "corrected" | "failed";
  regions: IntegrityRegionResult[];
  /** Shown on the result card, e.g. "Skin tone check: unchanged". */
  plainText: string;
  /** Present when status is "corrected": the image to show instead of the raw render (data URL or object URL). */
  correctedImage?: string;
  /** Measured after the correction, same regions. */
  after?: IntegrityRegionResult[];
}

// ---------- shared across lab, ui, platform and consult (only the orchestrator edits this file) ----------

/** The user's answer to "Has your hair loss started?". The length detector can't tell bald from short, so we ask. */
export type HairLossStage = "not_yet" | "started" | "gone";

/** Features makeup-vto can draw that we composite back onto the original. */
export type FeatureKind = "brows" | "lashes";

/** Colours read locally from the user's photo (0 units). Hex "#RRGGBB". */
export interface SampledColours {
  hair?: string;
  brows?: string;
  /** Pixels the sample is based on; low counts mean "not enough hair/brow to read". */
  hairPixels: number;
  browPixels: number;
}

/** UI accent derived from the hair colour, already adjusted to pass 4.5:1 on the background. */
export interface AccentColour {
  hex: string;
  /** The measured hair colour before any contrast adjustment. */
  source?: string;
  contrast: number;
  fallback: boolean;
}

/** A catalogue item ranked for one person. */
export interface RankedItem {
  item: CatalogueItem;
  /** ΔE2000 between the user's hair colour and the item colour (lower is closer). */
  colourDistance: number;
  reason: "closest" | "something_new";
}

/** Demo people. A = before hair loss, B = bald, C = regrowth. */
export type PersonaId = `P${1 | 2 | 3 | 4}${"A" | "B" | "C"}`;

/** Live-mode budget state, as returned by platform to the UI. */
export interface UnitStatus {
  mode: "mock" | "live";
  /** True when the daily cap or the judging reserve is reached: recordings are served, clearly labelled. */
  servingRecordings: boolean;
  remainingToday?: number;
  reason?: "daily_cap" | "reserve" | "unavailable";
}
