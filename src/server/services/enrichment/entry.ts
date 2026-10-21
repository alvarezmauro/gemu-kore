import "server-only";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import { enrichmentTarget } from "@/features/enrichment/validation";
import { readAccessoryEnrichmentTarget } from "@/server/repositories/catalog/enrichment";
import { readEnrichmentTarget } from "@/server/repositories/catalog/enrichment";
import { searchCompanies } from "@/server/repositories/enrichment";
import { guarded, loadTarget, parse } from "./common";
import { EnrichmentError } from "./errors";

export async function getEnrichmentTarget(
  context: PrivateAccessContext,
  input: unknown,
) {
  const target = parse(enrichmentTarget, input);
  return guarded(context, async (_actor, tx) => {
    const snapshot = await loadTarget(target, tx);
    if (snapshot.archived) throw new EnrichmentError("CONFLICT");
    if (target.kind === "accessory" || target.kind === "variant") {
      const record = await readAccessoryEnrichmentTarget(
        target.kind,
        target.id,
        tx,
      );
      if (!record) throw new EnrichmentError("NOT_FOUND");
      return {
        target,
        label: snapshot.label,
        revision: snapshot.revision,
        query: ("accessoryId" in record
          ? record.accessory.name
          : record.name
        ).slice(0, 200),
      };
    }
    const loaded = await readEnrichmentTarget(target.kind, target.id, tx);
    if (!loaded) throw new EnrichmentError("NOT_FOUND");
    const name =
      "gameId" in loaded.record ? loaded.record.game.name : loaded.record.name;
    return {
      target,
      label: snapshot.label,
      revision: snapshot.revision,
      query: name.slice(0, 200),
    };
  });
}
export async function findEnrichmentCompanies(
  context: PrivateAccessContext,
  input: unknown,
) {
  const { query } = parse(
    z.strictObject({ query: z.string().trim().min(2).max(200) }),
    input,
  );
  return guarded(context, async (_actor, tx) => searchCompanies(query, tx));
}
