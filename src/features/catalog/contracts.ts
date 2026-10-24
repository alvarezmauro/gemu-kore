export const catalogKinds = ["company", "region", "platform", "model"] as const;
export type CatalogKind = (typeof catalogKinds)[number];
export const catalogLabels: Record<CatalogKind, string> = {
  company: "Companies",
  region: "Markets",
  platform: "Platforms",
  model: "Hardware models",
};
export type CatalogOption = {
  id: string;
  name: string;
  archived: boolean;
  detail?: string;
};
export type ReferenceInput = {
  id?: string;
  provider: string;
  providerObjectType: string;
  externalId: string;
  url: string;
};
export type CatalogRecord = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  fields: Record<string, string>;
  markets: CatalogOption[];
  platform: CatalogOption | null;
  manufacturer: CatalogOption | null;
  references: ReferenceInput[];
};
export type CatalogActionResult =
  { status: "success"; id: string } | { status: "error"; message: string };
type CatalogField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "year" | "decimal";
  hint?: string;
};
const common: CatalogField[] = [
  { key: "name", label: "Name" },
  {
    key: "slug",
    label: "Slug",
    hint: "Unique lowercase name with hyphens, such as playstation-2.",
  },
  { key: "description", label: "Description", type: "textarea" },
];
export const catalogFields: Record<CatalogKind, CatalogField[]> = {
  company: [
    ...common,
    {
      key: "countryCode",
      label: "Country code",
      hint: "Two-letter country code, for example JP. Leave unknown values empty.",
    },
    { key: "foundedYear", label: "Founded year", type: "year" },
    { key: "website", label: "Website" },
    {
      key: "aliases",
      label: "Other names",
      type: "textarea",
      hint: "One name per line.",
    },
  ],
  region: [
    ...common,
    {
      key: "code",
      label: "Market code",
      hint: "A stable commercial market code, such as JP or NA. PAL, NTSC and Region Free are not markets.",
    },
  ],
  platform: [
    ...common,
    { key: "generation", label: "Generation", type: "year" },
    {
      key: "originalReleaseYear",
      label: "Original release year",
      type: "year",
    },
    { key: "discontinuedYear", label: "Discontinued year", type: "year" },
    { key: "history", label: "History", type: "textarea" },
    {
      key: "aliases",
      label: "Other names",
      type: "textarea",
      hint: "One name per line.",
    },
  ],
  model: [
    ...common,
    { key: "modelNumber", label: "Model number" },
    { key: "releaseYear", label: "Release year", type: "year" },
    { key: "discontinuedYear", label: "Discontinued year", type: "year" },
    { key: "widthMm", label: "Width (mm)", type: "decimal" },
    { key: "heightMm", label: "Height (mm)", type: "decimal" },
    { key: "depthMm", label: "Depth (mm)", type: "decimal" },
    { key: "weightGrams", label: "Weight (g)", type: "decimal" },
    { key: "regionLockNote", label: "Region lock notes", type: "textarea" },
    {
      key: "specifications",
      label: "Specifications (JSON)",
      type: "textarea",
      hint: 'Optional JSON object, for example {"cpu": {"name": "Emotion Engine"}}. Do not include a schemaVersion wrapper.',
    },
  ],
};
