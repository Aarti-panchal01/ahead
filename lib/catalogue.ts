import raw from "@/catalogue/catalogue.json";
import type { CatalogueItem } from "@/lib/types";

export const CATALOGUE = raw as CatalogueItem[];

export function getItem(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((x) => x.id === id);
}

/** Stable Ahead reference SKU; an internal matching code, never a retailer stock identifier. */
export function referenceSku(item: CatalogueItem): string {
  const sequence = item.id.slice(1).padStart(3, "0");
  return `AHD-${item.kind === "wig" ? "WIG" : "WRP"}-${sequence}`;
}
