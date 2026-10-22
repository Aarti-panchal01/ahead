import { describe, expect, it } from "vitest";
import { findClaims } from "@/lib/agent/claims";
import { CARE_TEAM_LINE, parseIsoDate, planTimeline } from "@/lib/agent/timeline";

const now = new Date("2026-10-22T15:00:00Z");

describe("plan_timeline", () => {
  it("dates from the first treatment: choose now, order by day 6, window day 7 to 21, care team last", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-11-02", now });
    expect(t.map((x) => [x.date, x.label])).toEqual([
      ["2026-10-22", "Choose your wig now"],
      ["2026-11-08", "Order your wig by this date"],
      ["2026-11-09", "Hair loss often starts around here"],
      [undefined, CARE_TEAM_LINE],
    ]);
    expect(t[0].note).toMatch(/save a lock of hair and photograph your current style/i);
    expect(t[1].note).toMatch(/returnable only unopened/);
    expect(t[2].note).toContain("2026-11-09 to 2026-11-23");
    expect(t[2].note).toContain("MedlinePlus");
  });

  it("crosses month and year ends in UTC", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-12-28", now });
    expect(t.find((x) => x.label.startsWith("Order"))!.date).toBe("2027-01-03");
    expect(t.find((x) => x.label.startsWith("Hair loss"))!.note).toContain("2027-01-04 to 2027-01-18");
  });

  it("when the order-by day has passed, says order soon (today)", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-10-15", now });
    const order = t.find((x) => x.label.startsWith("Order"))!;
    expect(order).toMatchObject({ date: "2026-10-22", label: "Order your wig soon" });
    expect(order.note).toContain("Hair loss often starts from 2026-10-22");
    expect(t.map((x) => x.date)).toEqual(["2026-10-22", "2026-10-22", "2026-10-22", undefined]);
  });

  it("no date: relative wording and no dates", () => {
    const t = planTimeline({ stage: "not_yet", now });
    expect(t.every((x) => x.date === undefined)).toBe(true);
    expect(t.map((x) => x.label)).toEqual([
      "Choose your wig now",
      "Order your wig within 6 days of your first treatment",
      "Hair loss often starts 7 to 21 days after the first treatment",
      CARE_TEAM_LINE,
    ]);
  });

  it("an invalid date counts as no date", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("22/10/2026")).toBeNull();
    expect(planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-02-30", now }).every((x) => x.date === undefined)).toBe(true);
  });

  it("hair loss started or gone: no window, still ends with the care team line", () => {
    for (const stage of ["started", "gone"] as const) {
      const t = planTimeline({ stage, firstTreatmentDate: "2026-10-01", now });
      expect(t.some((x) => x.label.startsWith("Hair loss"))).toBe(false);
      expect(t.at(-1)!.label).toBe(CARE_TEAM_LINE);
    }
  });

  it("passes the claim linter", () => {
    for (const stage of ["not_yet", "started", "gone"] as const) {
      for (const d of [undefined, "2026-11-02"]) {
        const text = planTimeline({ stage, firstTreatmentDate: d, now }).map((x) => `${x.label}. ${x.note ?? ""}`).join("\n");
        expect(findClaims(text)).toEqual([]);
      }
    }
  });
});
