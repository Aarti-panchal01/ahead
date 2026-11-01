import type { HairLossStage } from "@/lib/types";

/** Results are addressable for sample people (?person=P1&stage=gone) so a demo link works on its own. A real photo stays in memory only. */
export function resultsHref(photoKind: "sample" | "own", stage: HairLossStage, person?: string): string {
  const q = new URLSearchParams({ stage });
  if (photoKind === "sample" && person) q.set("person", person);
  return `/results?${q.toString()}`;
}

function sampleRoute(path: "/stage" | "/plan", photoKind: "sample" | "own", stage: HairLossStage, person?: string): string {
  const q = new URLSearchParams({ stage });
  if (photoKind === "sample" && person) q.set("person", person);
  return `${path}?${q.toString()}`;
}

export const stageHref = (photoKind: "sample" | "own", stage: HairLossStage, person?: string) => sampleRoute("/stage", photoKind, stage, person);
export const planHref = (photoKind: "sample" | "own", stage: HairLossStage, person?: string) => sampleRoute("/plan", photoKind, stage, person);

const STAGE_VALUES: HairLossStage[] = ["not_yet", "started", "gone"];

export function parseStage(v: string | null | undefined): HairLossStage | undefined {
  return STAGE_VALUES.find((s) => s === v);
}
