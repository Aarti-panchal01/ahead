// Shared types for Still Me. Server routes, the YouCam client and the UI all speak these.

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
  "AI-generated": true;
}

export type TryOnStatus = "running" | "success" | "error";

export interface TryOnJob {
  /** Task id returned to the browser. Mock ids start with "mock:". */
  id: string;
  itemId: string;
  mode: "mock" | "live";
  createdAt: string;
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
  /** Shown on the result card, e.g. "Your skin tone is unchanged." */
  plainText: string;
}
