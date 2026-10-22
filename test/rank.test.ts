import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/lib/catalogue";
import { SAMPLE_PEOPLE } from "@/lib/client/personas";
import { rankCatalogue } from "@/lib/rank";
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

  it.each(SAMPLE_PEOPLE)("$id: closest 3 are their curated (recorded) wigs", (p) => {
    const r = rankCatalogue(CATALOGUE, { hair: p.hair, length: p.length, curatedFor: p.id });
    const curated = CATALOGUE.filter((x) => x.matches === p.id).map((x) => x.id).sort();
    expect(r.wigs.slice(0, 3).map((x) => x.item.id).sort()).toEqual(curated);
    expect(curated).not.toContain(r.wigs[3].item.id);
  });

  it("is deterministic", () => {
    const a = rankCatalogue(CATALOGUE, { hair: "#888585", length: "shoulder" });
    const b = rankCatalogue(CATALOGUE, { hair: "#888585", length: "shoulder" });
    expect(a).toEqual(b);
  });
});
