// Copy used on more than one screen or checked by tests. Plain sentence case, cosmetic language only.
export const PREVIEW_DISCLAIMER = "Style and colour preview, not cap fit, density or comfort.";

export const CONSENT_LINES = [
  "We use your photo only to show you wigs and head wraps on yourself.",
  "Nothing is stored after this session. Close the tab and your photo is gone.",
  "Previews show style and colour only, not cap fit, density or comfort.",
];

export const MOCK_PHOTO_NOTE = "In this demo, previews use our sample people. Your own photo stays on this device and sets your colour and your matches.";

/** docs/api-truth-table.md row 10: the length detector reports a bald head as "above the ears". */
export const WHY_WE_ASK = "Our hair detector can't tell short hair from no hair, so we ask you instead.";

export const STAGES = [
  { value: "not_yet", label: "Not yet" },
  { value: "started", label: "It has started" },
  { value: "gone", label: "My hair is gone" },
] as const;
