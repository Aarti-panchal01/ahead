import { describe, expect, it } from "vitest";
import { findClaims, lintLines, lintText, SAFE_LINE } from "@/lib/agent/claims";

describe("claim linter", () => {
  it.each([
    "This wig can cure your worries.",
    "We treat hair loss gently.",
    "Cooling helps prevent hair loss.",
    "It will stop your hair loss.",
    "We can diagnose thinning.",
    "Take 5 mg daily.",
    "Results are guaranteed.",
    "It is clinically proven.",
    "You should delay your chemo until after the wedding.",
    "Try a cold cap.",
    "Biotin supplements help.",
    "Your photos were deleted from YouCam.",
  ])("flags %s", (s) => {
    expect(findClaims(s).length).toBeGreaterThan(0);
    const r = lintText(s);
    expect(r.clean).toBe(false);
    expect(r.text).toBe(SAFE_LINE);
  });

  it.each([
    "Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (MedlinePlus).",
    "Choose your wig now, before your first treatment.",
    "Curly and wavy wigs are in your list.",
    "Your photo stays secure in this session.",
    "Previews show style and colour, not cap fit, density or comfort.",
    "Check details with your care team.",
  ])("allows %s", (s) => {
    expect(findClaims(s)).toEqual([]);
    expect(lintText(s).text).toBe(s);
  });

  it("allows 'deleted from YouCam' only when it is true", () => {
    expect(lintText("Your try-ons were deleted from YouCam.", { deletedFromYoucam: true }).clean).toBe(true);
  });

  it("drops only the bad sentences and adds the safe line once", () => {
    const r = lintText("Here are three wigs. This will cure it. Also treats it.\nEach try-on waits for your OK.");
    expect(r.text).toBe(`Here are three wigs. ${SAFE_LINE}\nEach try-on waits for your OK.`);
    expect(r.hits.map((h) => h.rule)).toEqual(["cure", "treat"]);
  });

  it("lintLines keeps one safe line", () => {
    const r = lintLines(["It cures.", "Guaranteed fit.", "A soft bob."]);
    expect(r.lines).toEqual([SAFE_LINE, "A soft bob."]);
  });
});
