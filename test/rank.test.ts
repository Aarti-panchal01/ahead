import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/lib/catalogue";
import { SAMPLE_PEOPLE, getSample } from "@/lib/client/personas";
import { CLOSE_DELTA_E, matchLabel, matchLabelText, rankCatalogue, texturesClose } from "@/lib/rank";
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

  // Owner's required matches: a sample person ranks only among her own recordings (no id special-casing).
  const top = (id: string) => {
    const p = getSample(id)!;
    return rankCatalogue(CATALOGUE, { hair: p.hair, length: p.length, texture: p.texture, pool: { wigs: p.recordedWigs, wraps: p.recordedWraps } });
  };

  it.each(SAMPLE_PEOPLE)("$id: 3 closest + 1 something new of a different length, all from her recordings", (p) => {
    const r = top(p.id);
    expect(r.wigs.map((x) => x.reason)).toEqual(["closest", "closest", "closest", "something_new"]);
    expect(r.wigs[3].item.length).not.toBe(p.length);
    expect(r.wigs.every((x) => p.recordedWigs.includes(x.item.id))).toBe(true);
    expect(r.wraps.map((x) => x.item.id).sort()).toEqual([...p.recordedWraps].sort());
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
  const W = (texture: string) => CATALOGUE.find((x) => x.kind === "wig" && x.texture === texture)!;
  const r = (colourDistance: number, texture = "straight", reason: "closest" | "something_new" = "closest") => ({ item: W(texture), colourDistance, reason });
  const straightHair = { hair: "#202020", texture: "straight" };

  it("close needs colour under the threshold AND a close texture", () => {
    expect(matchLabel(r(CLOSE_DELTA_E - 0.1), straightHair)).toBe("close");
    expect(matchLabel(r(CLOSE_DELTA_E), straightHair)).toBe("neutral");
    expect(matchLabel(r(1, "wavy"), straightHair)).toBe("close");
    expect(matchLabel(r(1, "curly"), straightHair)).toBe("neutral");
    expect(matchLabel(r(1, "coily"), straightHair)).toBe("neutral");
  });
  it("texture neighbours: one step along straight-wavy-curly-coily, never straight vs coily", () => {
    expect(texturesClose("curly", "coily")).toBe(true);
    expect(texturesClose("wavy", "curly")).toBe(true);
    expect(texturesClose("straight", "curly")).toBe(false);
    expect(texturesClose("straight", "coily")).toBe(false);
    expect(texturesClose("coily", "straight")).toBe(false);
    expect(texturesClose(undefined, "straight")).toBe(false);
  });
  it("never says close without a hair colour", () => expect(matchLabel(r(0), { texture: "straight" })).toBe("neutral"));
  it("an own photo (no texture) can only be close in colour", () => {
    expect(matchLabel(r(2), { hair: "#202020" })).toBe("colour");
    expect(matchLabelText("colour", "your")).toBe("Close to your hair colour");
  });
  it("keeps something new", () => expect(matchLabel(r(1, "straight", "something_new"), straightHair)).toBe("new"));
  it("words it for her or for you", () => {
    expect(matchLabelText("close", "her")).toBe("Close to her hair");
    expect(matchLabelText("close", "your")).toBe("Close to your hair");
    expect(matchLabelText("neutral", "your")).toBe("Worth a look");
  });
});

describe("top 3 and labels for each sample person", () => {
  const ranked = (id: string) => {
    const p = getSample(id)!;
    const r = rankCatalogue(CATALOGUE, { hair: p.hair, length: p.length, texture: p.texture, pool: { wigs: p.recordedWigs, wraps: p.recordedWraps } });
    return r.wigs.slice(0, 3).map((x) => ({ id: x.item.id, texture: x.item.texture, label: matchLabel(x, { hair: p.hair, texture: p.texture }) }));
  };

  it("P1 (grey, long, curly): W01 close, then W06 (wavy) and W04, not close in colour", () => {
    expect(ranked("P1")).toEqual([
      { id: "W01", texture: "curly", label: "close" },
      { id: "W06", texture: "wavy", label: "neutral" },
      { id: "W04", texture: "straight", label: "neutral" },
    ]);
  });
  it("P2 (ash brown, chin, straight): W04 close, W09 and the greyer W03 worth a look", () => {
    expect(ranked("P2")).toEqual([
      { id: "W04", texture: "straight", label: "close" },
      { id: "W09", texture: "straight", label: "neutral" },
      { id: "W03", texture: "straight", label: "neutral" },
    ]);
  });
  it("P3 (black, shoulder, coily): W07 first, and no straight wig is ever called close", () => {
    const r = ranked("P3");
    expect(r[0]).toEqual({ id: "W07", texture: "coily", label: "close" });
    expect(r.filter((x) => x.texture === "straight" && x.label === "close")).toEqual([]);
    expect(r.map((x) => x.id)).toEqual(["W07", "W08", "W01"]);
  });
  it("P4 (black, chin, straight): W10 or W11 first, three close straight bobs and layers", () => {
    const r = ranked("P4");
    expect(["W10", "W11"]).toContain(r[0].id);
    expect(r).toEqual([
      { id: "W11", texture: "straight", label: "close" },
      { id: "W10", texture: "straight", label: "close" },
      { id: "W02", texture: "straight", label: "close" },
    ]);
  });
});
