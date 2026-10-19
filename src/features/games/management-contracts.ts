import type { CopyPhysicalDraft } from "@/features/collection/copy-validation";
import type { ConsoleImage } from "@/features/consoles/contracts";
import type {
  GameChoice,
  PlatformChoice,
  ReleaseChoice,
} from "./creation-contracts";
import type {
  DefectSeverity,
  DefectStatus,
} from "@/features/defects/contracts";
export type GameCopyDetail = {
  id: string;
  revision: number;
  publicationStatus: "PRIVATE" | "PUBLISHED";
  fields: Omit<CopyPhysicalDraft, "defects">;
  location: string | null;
  game: GameChoice & { archived: boolean };
  platform: PlatformChoice & { archived: boolean };
  release: ReleaseChoice & { archived: boolean };
  firstReleaseYear: number | null;
  developers: string[];
  credits: {
    company: string;
    role: string;
    label: string | null;
    market: string | null;
  }[];
  cover: ConsoleImage | null;
  photos: ConsoleImage[];
  defects: {
    id: string;
    title: string;
    description: string | null;
    severity: DefectSeverity;
    status: DefectStatus;
    repairNote: string | null;
  }[];
  defectCount: number;
};
