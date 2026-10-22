// Copy used on more than one screen or checked by tests. Plain sentence case, cosmetic language only.
export const PREVIEW_DISCLAIMER = "Style and colour preview, not cap fit, density or comfort.";

export const CONSENT_LINES = [
  "We use your photo only to show you wigs and head wraps on yourself.",
  "Nothing is stored after this session. Close the tab and your photo is gone.",
  "Previews show style and colour only, not cap fit, density or comfort.",
  "When live previews are on, your photo is sent to YouCam to make them. Your try-ons are deleted from YouCam at the end of your session.",
];


/** docs/api-truth-table.md row 10: the length detector reports a bald head as "above the ears". */
export const WHY_WE_ASK = "Our hair detector can't tell short hair from no hair, so we ask you instead.";

export const STAGES = [
  { value: "not_yet", label: "Not yet" },
  { value: "started", label: "It has started" },
  { value: "gone", label: "My hair is gone" },
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
