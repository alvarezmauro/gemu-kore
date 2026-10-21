import type { ModelPoster } from "@/lib/three/contracts";
import type { TrailerReference } from "@/features/games/trailer-validation";
import type { AssetAttribution } from "@/features/provenance/contracts";
export type AccessoryScope = "family" | "variant" | "unknown";
export type AccessoryImage = ModelPoster & {
  id: string;
  caption: string | null;
  source: AssetAttribution;
};
export type AccessoryPresentation = {
  description: { value: string | null; scope: AccessoryScope };
  specifications: {
    facts: { label: string; value: string }[];
    scope: AccessoryScope;
  };
  video: { value: TrailerReference | null; scope: AccessoryScope };
  yearScope: AccessoryScope;
  producerScope: AccessoryScope;
  regionLock: string | null;
  regionLockNote: string | null;
  catalog: {
    family: AccessoryImage[];
    variant: AccessoryImage[];
    page: number;
    hasNext: boolean;
  };
  photos: AccessoryImage[];
  morePhotos: boolean;
  poster: ModelPoster | null;
  model: {
    source: string;
    url: string;
    selectionKey: string;
    attribution: AssetAttribution;
  } | null;
};
