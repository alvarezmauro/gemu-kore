import type { SearchResult } from "./contracts";
export const catalogKinds = [
  "company",
  "platform",
  "model",
  "game",
  "release",
  "accessory",
  "variant",
  "region",
] as const;
export type CatalogHit = {
  id: string;
  kind: (typeof catalogKinds)[number];
  title: string;
  context: string;
  identificationStatus: "INCOMPLETE" | "CONFIRMED" | null;
};
export type PaletteResult = {
  collection: SearchResult;
  catalog: CatalogHit[];
  catalogHasMore: boolean;
};
