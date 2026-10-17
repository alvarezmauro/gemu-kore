import type {
  ConsoleChoices,
  ConsoleLocation,
  ConsolePlatformOption,
  ConsoleResult,
} from "@/features/consoles/contracts";
export type Choices<T> = ConsoleChoices<T>;
export type Result<T> = ConsoleResult<T>;
export type PlatformChoice = ConsolePlatformOption;
export type CopyLocation = ConsoleLocation;
export type GameChoice = {
  id: string;
  revision: number;
  name: string;
  slug: string;
  description: string | null;
};
export type ReleaseChoice = {
  id: string;
  revision: number;
  gameId: string;
  platformId: string;
  name: string;
  slug: string;
  editionType: string;
  editionName: string | null;
  printingLabel: string | null;
  markets: {
    id: string;
    name: string;
    year: number | null;
    month: number | null;
    day: number | null;
  }[];
  languages: string[];
  description: string | null;
  identificationStatus: string;
  regionLock: string | null;
  regionLockNote: string | null;
  components: {
    name: string;
    kind: string;
    quantity: number;
    description: string | null;
  }[];
};
export type ReleaseFilters = {
  marketId: string;
  editionType: "" | import("./validation").ReleaseFields["editionType"];
};
export const gameCreationSteps = [
  "Platform",
  "Game",
  "Release",
  "My copy",
  "Review",
] as const;
