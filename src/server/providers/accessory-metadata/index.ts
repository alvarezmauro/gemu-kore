import "server-only";
import { getAccessoryMetadataConfiguration } from "@/server/config/accessory-metadata";
import { createWikidataAccessoryProvider } from "./wikidata";
import type { AccessoryMetadataProvider } from "./contracts";
let provider: AccessoryMetadataProvider | undefined;
export function getAccessoryMetadataProvider() {
  return (provider ??= createWikidataAccessoryProvider(
    getAccessoryMetadataConfiguration(),
  ));
}
