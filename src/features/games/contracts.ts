import type {
  CatalogOption,
  ReferenceInput,
} from "@/features/catalog/contracts";
import type { GameFields, ReleaseFields } from "./validation";
export type GameCatalogRecord = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  options: {
    company: CatalogOption[];
    region: CatalogOption[];
    game: CatalogOption[];
    platform: CatalogOption[];
  };
  references: ReferenceInput[];
} & (
  | { kind: "game"; fields: GameFields }
  | { kind: "release"; fields: ReleaseFields }
);
