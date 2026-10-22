// draft_brief: a plain stylist brief. Deterministic; the claim linter runs on it before it leaves the server.
import { getItem } from "@/lib/catalogue";
import type { CatalogueItem } from "@/lib/types";

export const PREVIEW_LINE = "These were style and colour previews, not cap fit, density or comfort.";

export interface BriefInput {
  itemIds: string[];
  /** Measured hair colour "#RRGGBB" (approximate, from a photo). */
  hairColour?: string;
  browColour?: string;
  notes?: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function draftBrief({ itemIds, hairColour, browColour, notes }: BriefInput): string {
  const items = itemIds.map((id) => getItem(id)).filter((x): x is CatalogueItem => !!x);
  const lines: string[] = ["Stylist brief from Ahead", ""];
  if (items.length) {
    lines.push("Styles I am considering:");
    for (const x of items) lines.push(`- ${x.name} (${x.kind}, colour about ${x.colour.toUpperCase()}, ref ${x.id})`);
  } else {
    lines.push("Styles I am considering: none chosen yet.");
  }
  lines.push("");
  if (hairColour && HEX.test(hairColour)) {
    lines.push(`My hair colour: about ${hairColour.toUpperCase()}, read from a photo, so it is approximate. I will bring a lock of hair to match the colour.`);
  } else {
    lines.push("I will bring a lock of hair to match the colour.");
  }
  if (browColour && HEX.test(browColour)) lines.push(`Brow colour: about ${browColour.toUpperCase()}.`);
  const n = notes?.replace(/\s+/g, " ").trim();
  if (n) lines.push(`Notes: ${n.slice(0, 500)}`);
  lines.push("", PREVIEW_LINE);
  return lines.join("\n");
}
