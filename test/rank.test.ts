import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/lib/catalogue";
import { SAMPLE_PEOPLE, getSample } from "@/lib/client/personas";
import { CLOSE_DELTA_E, matchLabel, matchLabelText, rankCatalogue } from "@/lib/rank";
import type { CatalogueItem } from "@/lib/types";

const wig = (id: string, colour: string, length: string, extra: Partial<CatalogueItem> = {}): CatalogueItem => ({
  id, kind: "wig", name: id, image: `/catalogue/${id}.jpg`, colour, length, texture: "straight",
  reference: "on-model", usableAsReference: true, "AI-generated": true, ...extra,
});

describe("rankCatalogue", () => {
  it("returns 3 closest wigs and 1 something new, all distinct", () => {
    const r = rankCatalogue(CATALOGUE, { hair: "#6E5A4A", length: "shoulder" });
    expect(r.wigs).toHaveLength(4);
    expect(r.wigs.map((x) => x.reason)).toEqual(["closest", "closest", "closest", "something_new"]);
    expect(new Set(r.wigs.map((x) => x.item.id)).size).toBe(4);
    expect(r.wigs.every((x) => x.item.kind === "wig")).toBe(true);
  });

  it("orders closest by colour when lengths are equal", () => {
    const items = [wig("A", "#000000", "chin"), wig("B", "#808080", "chin"), wig("C", "#202020", "chin"), wig("D", "#FFFFFF", "chin")];
    const r = rankCatalogue(items, { hair: "#101010", length: "chin" });
    expect(r.wigs.slice(0, 3).map((x) => x.item.id)).toEqual(["A", "C", "B"]);
    expect(r.wigs[0].colourDistance).toBeLessThan(r.wigs[1].colourDistance);
  });

  it("penalises a different length", () => {
    const items = [wig("same", "#303030", "chin"), wig("far", "#2A2A2A", "long"), wig("x", "#FFFFFF", "chin"), wig("y", "#EEEEEE", "chin")];
    const r = rankCatalogue(items, { hair: "#2A2A2A", length: "chin" });
    expect(r.wigs[0].item.id).toBe("same");
  });

  it("picks something new from a different length, closest colour first", () => {
    const items = [
      wig("a", "#303030", "shoulder"), wig("b", "#353535", "shoulder"), wig("c", "#3A3A3A", "shoulder"),
      wig("pixieClose", "#323232", "pixie"), wig("pixieFar", "#F0F0F0", "pixie"), wig("chin", "#303030", "chin"),
    ];
    const r = rankCatalogue(items, { hair: "#303030", length: "shoulder" });
    expect(r.wigs[3]).toMatchObject({ reason: "something_new", item: { id: "pixieClose" } });
  });

  it("skips items YouCam can't use as a reference", () => {
    const items = [wig("bad", "#303030", "chin", { usableAsReference: false, reference: "mannequin" }), wig("ok", "#909090", "chin")];
    const r = rankCatalogue(items, { hair: "#303030", length: "chin" });
    expect(r.wigs.map((x) => x.item.id)).toEqual(["ok"]);
  });

  it("with no hair colour, gives a dark-to-light spread", () => {
    const r = rankCatalogue(CATALOGUE, {});
    expect(r.wigs).toHaveLength(4);
    const closest = r.wigs.slice(0, 3).map((x) => x.item.id);
    expect(closest).toContain("W05"); // the lightest wig, silver grey
    expect(r.wigs.every((x) => x.colourDistance === 0)).toBe(true);
  });

  it("lists every wrap, closest colour first", () => {
    const r = rankCatalogue(CATALOGUE, { hair: "#191B21" });
    expect(r.wraps.map((x) => x.item.id).sort()).toEqual(["H01", "H02", "H03", "H04"]);
    expect(r.wraps[0].item.id).toBe("H02"); // navy turban is nearest to black hair
  });

  // Owner's required matches (ranking over ALL wigs, no curation, no id special-casing).
  const top = (id: string) => {
    const p = getSample(id)!;
    return rankCatalogue(CATALOGUE, { hair: p.hair, length: p.length, texture: p.texture });
  };
  it("P1 (grey, long, curly) ranks W01 first", () => expect(top("P1").wigs[0].item.id).toBe("W01"));
  it("P2 (ash brown, chin, straight) ranks W04 first", () => expect(top("P2").wigs[0].item.id).toBe("W04"));
  it("P3 (black, shoulder, coily) ranks W07 first", () => expect(top("P3").wigs[0].item.id).toBe("W07"));
  it("P4 (black, chin, straight) ranks W10 or W11 first", () => expect(["W10", "W11"]).toContain(top("P4").wigs[0].item.id));

  it.each(SAMPLE_PEOPLE)("$id: 3 closest + 1 something new of a different length", (p) => {
    const r = top(p.id);
    expect(r.wigs.map((x) => x.reason)).toEqual(["closest", "closest", "closest", "something_new"]);
    expect(r.wigs[3].item.length).not.toBe(p.length);
    expect(r.usedShape).toBe(true);
  });

  it("uses texture: a coily match beats a straight one of the same colour and length", () => {
    const items = [wig("straight", "#202020", "chin"), wig("coily", "#242424", "chin", { texture: "coily" }), wig("x", "#FFFFFF", "chin"), wig("y", "#EEEEEE", "pixie")];
    const r = rankCatalogue(items, { hair: "#202020", length: "chin", texture: "coily" });
    expect(r.wigs[0].item.id).toBe("coily");
  });

  it("an own photo is ranked on colour only", () => {
    const r = rankCatalogue(CATALOGUE, { hair: "#1C1B1F" });
    expect(r.usedShape).toBe(false);
    const d = r.wigs.slice(0, 3).map((x) => x.colourDistance);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
  it("is deterministic", () => {
    const a = rankCatalogue(CATALOGUE, { hair: "#888585", length: "shoulder" });
    const b = rankCatalogue(CATALOGUE, { hair: "#888585", length: "shoulder" });
    expect(a).toEqual(b);
  });
});

describe("match labels", () => {
  const r = (colourDistance: number, reason: "closest" | "something_new" = "closest") => ({ item: CATALOGUE[0], colourDistance, reason });
  it("says close only under the threshold", () => {
    expect(matchLabel(r(CLOSE_DELTA_E - 0.1), true)).toBe("close");
    expect(matchLabel(r(CLOSE_DELTA_E), true)).toBe("neutral");
    expect(matchLabel(r(14), true)).toBe("neutral");
  });
  it("never says close without a hair colour", () => expect(matchLabel(r(0), false)).toBe("neutral"));
  it("keeps something new", () => expect(matchLabel(r(1, "something_new"), true)).toBe("new"));
  it("words it for her or for you", () => {
    expect(matchLabelText("close", "her")).toBe("Close to her hair");
    expect(matchLabelText("close", "your")).toBe("Close to your hair");
    expect(matchLabelText("neutral", "your")).toBe("Worth a look");
  });
  it("P1's W01 is close; P2's third match is not", () => {
    const p1 = getSample("P1")!, p2 = getSample("P2")!;
    const a = rankCatalogue(CATALOGUE, { hair: p1.hair, length: p1.length, texture: p1.texture });
    const b = rankCatalogue(CATALOGUE, { hair: p2.hair, length: p2.length, texture: p2.texture });
    expect(matchLabel(a.wigs[0], true)).toBe("close");
    expect(matchLabel(b.wigs[2], true)).toBe("neutral");
  });
});
