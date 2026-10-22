import raw from "@/catalogue/catalogue.json";
import type { CatalogueItem } from "@/lib/types";

export const CATALOGUE = raw as CatalogueItem[];

export function getItem(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((x) => x.id === id);
}
