// Copy used on more than one screen or checked by tests. Plain sentence case, cosmetic language only.
export const PREVIEW_DISCLAIMER = "Style preview only—not fit, density, or comfort.";

/** Warm intro line above the results carousel. No outcomes, no promises. */
export const RESULTS_INTRO = "Choose a style to see it on your photo.";

/** Intro line for the wraps tab. */
export const WRAPS_INTRO = "Explore head wraps and soft-cover options on your photo.";

export const CONSENT_LINES = [
  "In live mode, choosing “Show my matches” sends your photo to YouCam to generate the wig and headwear previews available today.",
  "Your photo remains in this browser until you close the tab.",
  "A preview helps you explore style and colour; it cannot confirm fit, comfort, or product availability.",
  "YouCam try-on tasks are deleted when your session ends.",
];


/** docs/api-truth-table.md row 10: the length detector reports a bald head as "above the ears". */
export const WHY_WE_ASK = "We won't guess from a photo. Choose the answer that feels right; you can change it later.";

export const STAGES = [
  { value: "not_yet", label: "I’m preparing ahead" },
  { value: "started", label: "It’s thinning or changing" },
  { value: "gone", label: "Most or all has fallen out" },
] as const;

/** docs/api-truth-table.md row 17: task delete verified 22 Oct, 0 units. */
export const DELETION_LINE = "Your try-ons are deleted from YouCam at the end of your session.";

/** docs/api-truth-table.md row 9: hair colour from a photo is approximate. */
export const SCREEN_COLOUR_NOTE = "Colours on screens vary, and a photo reads hair colour only approximately.";

/** "her" for a sample person, "your" for the user's own photo. */
export type Whose = "her" | "your";

export function lockLine(whose: Whose): string {
  return `Bring a lock of ${whose} hair to ${whose} stylist.`;
}

/** CLAUDE.md, Agent: the LLM gets only style choices and colours; the timeline is computed on our side. */
export const PLANNER_PRIVACY_LINE =
  "Our planning assistant never sees your photos, your treatment date or any health details. It gets only your style choices and colours; your timeline is worked out on our side.";

/** CLAUDE.md, Agent guardrails: 30 units max per session, and the user approves every paid step. */
export const PLANNER_UNITS_LINE =
  "The planning assistant can spend at most 30 YouCam units per visit, and only after you tap to approve each try-on.";

/** Owner's wording: the skin change in the truth table was YouCam's default skin smoothing, measured and turned off. */
export const SMOOTHING_LINE =
  "Where the table mentions skin coming out lighter, that was YouCam's default skin smoothing. We measured it, turned it off, and verify it on every render with the skin tone check.";
