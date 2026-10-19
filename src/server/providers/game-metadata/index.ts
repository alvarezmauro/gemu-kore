import "server-only";

import { getGameMetadataConfiguration } from "../../config/game-metadata";
import type { GameMetadataProvider } from "./contracts";
import { createIgdbGameMetadataProvider } from "./igdb";

let provider: GameMetadataProvider | undefined;

// The explicit composition point. Construction does not acquire a token or fetch.
// Environment changes/credential rotation take effect on server restart.
export function getGameMetadataProvider(): GameMetadataProvider {
  return (provider ??= createIgdbGameMetadataProvider(
    getGameMetadataConfiguration(),
  ));
}
