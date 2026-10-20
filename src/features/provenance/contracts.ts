export type MetadataAttribution = {
  origin: "MANUAL" | "SEED" | "PROVIDER" | "AI_ASSISTED" | "UNKNOWN";
  recordedAt: string | null;
  source: {
    name: string;
    retrievedAt: string;
    updatedAt: string[];
    urls: string[];
    scope: string;
    transformations: string[];
    confidence: null;
  } | null;
  note: string | null;
};
export type FieldAttribution = MetadataAttribution & {
  field: string;
  label: string;
  hasValue: boolean;
};
export type GameProvenance = {
  game: FieldAttribution[];
  release: FieldAttribution[];
};
export type AssetAttribution = {
  type: string;
  provider: string | null;
  url: string | null;
  author: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  restrictions: string | null;
  retrievedAt: string | null;
};
