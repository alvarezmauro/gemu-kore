import { emptyGame, emptyRelease } from "../../src/features/games/validation";
export const gameInput = (
  name = "Chrono Trigger",
  slug = "chrono-trigger",
) => ({
  kind: "game" as const,
  fields: { ...emptyGame, name, slug, developers: [] },
  references: [],
});
export const releaseInput = (
  gameId: string,
  platformId: string,
  slug = "chrono-trigger-snes-standard",
) => ({
  kind: "release" as const,
  fields: {
    ...emptyRelease,
    gameId,
    platformId,
    slug,
    markets: [],
    credits: [],
    includedItems: [],
  },
  references: [],
});
