export type ConsolePlatformOption = {
  id: string;
  revision: number;
  name: string;
  manufacturer: string | null;
  generation: number | null;
  releaseYear: number | null;
  logoUrl: string | null;
};
export type ConsoleModelOption = {
  id: string;
  revision: number;
  platformId: string;
  name: string;
  modelNumber: string | null;
  manufacturer: string | null;
  releaseYear: number | null;
  description: string | null;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
  markets: string[];
  regionLock: string | null;
  logoUrl: string | null;
  imageUrl: string | null;
};
export type ConsoleChoices<T> = { items: T[]; hasMore: boolean; page: number };
export type ConsoleResult<T> =
  { status: "success"; data: T } | { status: "error"; message: string };
export type ConsoleLocation = { id: string; label: string };
export const consoleSteps = [
  "Console",
  "Model",
  "Physical details",
  "Photos",
  "Overrides",
  "Review",
] as const;
export type ConsoleCopyFields = {
  serialNumber: string;
  observedMarkings: string;
  hasBox: "unknown" | "yes" | "no";
  locationId: string;
  notes: string;
};
export type ConsoleImage = {
  url: string;
  alt: string;
  width: number;
  height: number;
  caption: string | null;
};
export type ConsoleOverrideEntry = {
  id: string;
  type: "CUSTOM_LOGO" | "CUSTOM_MODEL";
  name: string;
  primary: boolean;
  url: string;
  width: number;
  height: number;
};
export type ConsoleDetail = {
  id: string;
  revision: number;
  publicationStatus: "PRIVATE" | "PUBLISHED";
  fields: ConsoleCopyFields;
  location: string | null;
  platform: ConsolePlatformOption & { archived: boolean };
  model: ConsoleModelOption & { archived: boolean };
  description: string | null;
  history: string | null;
  facts: { label: string; value: string }[];
  photos: ConsoleImage[];
  catalogImages: ConsoleImage[];
  defects: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    repairNote: string | null;
  }[];
  defectCount: number;
  overrides: ConsoleOverrideEntry[];
  primaryOverrides: ConsoleOverrideEntry[];
  overridePage: number;
  moreOverrides: boolean;
  logo: { url: string; source: string } | null;
  modelFile: { url: string; source: string } | null;
};
