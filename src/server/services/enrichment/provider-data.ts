import "server-only";
import {
  accessoryMetadataResult,
  accessoryReference,
  accessorySearchPage,
  type AccessoryMetadataProvider,
} from "@/server/providers/accessory-metadata/contracts";
import {
  gameMetadataResult,
  gameSearchPage,
  providerObjectReference,
  validateProviderOutput,
  type GameMetadataProvider,
  type ProviderContext,
} from "@/server/providers/game-metadata/contracts";
import type { Run } from "@/server/repositories/enrichment";
import { EnrichmentError } from "./errors";
export function accessoryRun(run: Run) {
  return Boolean(run.accessoryId || run.accessoryVariantId);
}
export function selectedReference(run: Run) {
  return accessoryRun(run)
    ? accessoryReference.parse(run.selectedCandidate)
    : providerObjectReference.parse(run.selectedCandidate);
}
export function searchData(run: Run, value: unknown = run.candidates) {
  return accessoryRun(run)
    ? accessorySearchPage.parse(value)
    : validateProviderOutput(gameSearchPage, value);
}
export function resultData(run: Run, value: unknown = run.result) {
  return accessoryRun(run)
    ? accessoryMetadataResult.parse(value)
    : validateProviderOutput(gameMetadataResult, value);
}
export async function retrieve(
  run: Run,
  query: string,
  context: ProviderContext,
  getGame: () => GameMetadataProvider,
  getAccessory: () => AccessoryMetadataProvider,
) {
  if (accessoryRun(run)) {
    const provider = getAccessory();
    if (provider.id !== "WIKIDATA" || run.provider !== provider.id)
      throw new EnrichmentError("INVALID_INPUT");
    return run.selectedCandidate
      ? provider.fetch(
          { item: accessoryReference.parse(run.selectedCandidate) },
          context,
        )
      : provider.search({ query, limit: 20 }, context);
  }
  const provider = getGame();
  if (provider.id !== "IGDB" || run.provider !== provider.id)
    throw new EnrichmentError("INVALID_INPUT");
  return run.selectedCandidate
    ? provider.fetch(
        { game: providerObjectReference.parse(run.selectedCandidate) },
        context,
      )
    : provider.search({ query, limit: 20 }, context);
}
