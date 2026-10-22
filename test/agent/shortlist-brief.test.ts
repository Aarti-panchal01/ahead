import { describe, expect, it } from "vitest";
import { draftBrief, PREVIEW_LINE } from "@/lib/agent/brief";
import { findClaims } from "@/lib/agent/claims";
import { shortlistFor } from "@/lib/agent/shortlist";
import { getItem } from "@/lib/catalogue";

describe("shortlist", () => {
  it.each([
    ["P1", ["W01"]],
    ["P2", ["W04"]],
    ["P3", ["W07"]],
    ["P4", ["W10", "W11"]],
  ] as const)("sample person %s: best match first, 3 closest + 1 something new, all real usable ids", (personaId, firsts) => {
    const s = shortlistFor({ stage: "not_yet", personaId });
    expect(firsts).toContain(s.ids[0]);
    expect(s.ids).toHaveLength(4);
    expect(s.ranked.slice(0, 3).every((r) => r.reason === "closest")).toBe(true);
    expect(s.ranked[3].reason).toBe("something_new");
    expect(new Set(s.ids).size).toBe(4);
    expect(s.ids.every((id) => getItem(id)?.usableAsReference)).toBe(true);
  });

  it("own hair colour competes across all wigs; wraps added on request", () => {
    const s = shortlistFor({ stage: "gone", hairColour: "#1C1B1F", preferences: { wantsWraps: true } });
    expect(s.ranked.filter((r) => r.item.kind === "wrap")).toHaveLength(2);
    expect(s.ranked.filter((r) => r.item.kind === "wig")).toHaveLength(4);
  });

  it("a texture preference changes the ranking through lib/rank.ts", () => {
    const s = shortlistFor({ stage: "not_yet", hairColour: "#262121", preferences: { texture: "coily" } });
    expect(s.ranked[0].item.texture).toBe("coily");
  });

  it("no colour at all still gives a spread", () => {
    expect(shortlistFor({ stage: "gone" }).ids.length).toBeGreaterThanOrEqual(3);
  });
});

describe("draft_brief", () => {
  it("lists items, hair hex + lock of hair, brows, notes and the preview line", () => {
    const b = draftBrief({ itemIds: ["W01", "nope"], hairColour: "#706d6b", browColour: "#63483B", notes: "  soft   fringe " });
    expect(b).toContain("Long soft curls, salt and pepper");
    expect(b).not.toContain("nope");
    expect(b).toContain("#706D6B");
    expect(b).toMatch(/bring a lock of hair/);
    expect(b).toContain("Brow colour: about #63483B.");
    expect(b).toContain("Notes: soft fringe");
    expect(b).toContain(PREVIEW_LINE);
    expect(findClaims(b)).toEqual([]);
  });

  it("without a colour still asks for a lock of hair", () => {
    expect(draftBrief({ itemIds: [] })).toMatch(/I will bring a lock of hair/);
  });
});
