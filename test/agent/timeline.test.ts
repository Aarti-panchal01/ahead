import { describe, expect, it } from "vitest";
import { findClaims } from "@/lib/agent/claims";
import { CARE_TEAM_LINE, ORDER_DAYS_BEFORE, parseIsoDate, planTimeline } from "@/lib/agent/timeline";
import { timelineNow } from "@/lib/agent/validate";

const now = new Date("2026-10-22T15:00:00Z");
const rows = (first?: string, at = now) =>
  planTimeline({ stage: "not_yet", firstTreatmentDate: first, now: at }).map((x) => [x.date, x.label]);

describe("plan_timeline", () => {
  it("owner example: first treatment 2026-11-03, today 2026-10-22", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-11-03", now });
    expect(t.map((x) => [x.date, x.label])).toEqual([
      ["2026-10-22", "Choose your wig now"],
      ["2026-10-27", "Order your wig by this date"],
      ["2026-11-03", "Have your wig or wrap ready"],
      ["2026-11-10", "Hair loss often starts around here"],
      [undefined, CARE_TEAM_LINE],
    ]);
    expect(t[0].note).toMatch(/save a lock of hair and photograph your current style/i);
    expect(t[1].note).toMatch(/7 days before your first treatment/);
    expect(t[1].note).toMatch(/returnable only unopened/);
    expect(t[2].note).toMatch(/first treatment day/i);
    expect(t[3].note).toContain("2026-11-10 to 2026-11-24");
    expect(t[3].note).toContain("MedlinePlus");
  });

  it("ready falls ON day 0 and the order-by date is 7 days before it", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-12-15", now });
    expect(ORDER_DAYS_BEFORE).toBe(7);
    expect(t.find((x) => x.label === "Have your wig or wrap ready")!.date).toBe("2026-12-15");
    expect(t.find((x) => x.label === "Order your wig by this date")!.date).toBe("2026-12-08");
  });

  it("crosses month and year ends in UTC", () => {
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2027-01-03", now });
    expect(t.find((x) => x.label.startsWith("Order"))!.date).toBe("2026-12-27");
    expect(t.find((x) => x.label.startsWith("Hair loss"))!.note).toContain("2027-01-10 to 2027-01-24");
  });

  it("order-by exactly today is still a date", () => {
    expect(rows("2026-10-29")[1]).toEqual(["2026-10-22", "Order your wig by this date"]);
  });

  it("never an order-by date in the past: 'as soon as you can', dated today", () => {
    expect(rows("2026-10-25")).toEqual([
      ["2026-10-22", "Choose your wig now"],
      ["2026-10-22", "Order your wig as soon as you can"],
      ["2026-10-25", "Have your wig or wrap ready"],
      ["2026-11-01", "Hair loss often starts around here"],
      [undefined, CARE_TEAM_LINE],
    ]);
    const t = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-10-25", now });
    expect(t[1].note).toContain("So it is ready by 2026-10-25.");
    // Treatment already began: still today, never a past order-by date.
    const past = planTimeline({ stage: "not_yet", firstTreatmentDate: "2026-10-10", now });
    const order = past.find((x) => x.label.startsWith("Order"))!;
    expect(order).toMatchObject({ date: "2026-10-22", label: "Order your wig as soon as you can" });
  });

  it("no date: relative wording and no dates", () => {
    const t = planTimeline({ stage: "not_yet", now });
    expect(t.every((x) => x.date === undefined)).toBe(true);
    expect(t.map((x) => x.label)).toEqual([
      "Choose your wig now",
      "Order your wig at least 7 days before your first treatment",
      "Have your wig or wrap ready by your first treatment",
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
      for (const d of [undefined, "2026-11-03", "2026-10-25", "2026-10-10"]) {
        const text = planTimeline({ stage, firstTreatmentDate: d, now }).map((x) => `${x.label}. ${x.note ?? ""}`).join("\n");
        expect(findClaims(text)).toEqual([]);
      }
    }
  });
});

describe("timelineNow (client local today)", () => {
  const server = new Date("2026-10-22T23:30:00Z");
  it("uses the client's date within one day of the server's UTC date", () => {
    expect(timelineNow("2026-10-23", server).toISOString().slice(0, 10)).toBe("2026-10-23");
    expect(timelineNow("2026-10-21", server).toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(timelineNow("2026-10-22", server).toISOString().slice(0, 10)).toBe("2026-10-22");
  });
  it("falls back to the server's UTC date when missing, invalid or implausible", () => {
    for (const t of [undefined, "", "2026-02-30", "2026-10-30", "1999-01-01"]) expect(timelineNow(t, server)).toBe(server);
  });
});
