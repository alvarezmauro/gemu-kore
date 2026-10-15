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
