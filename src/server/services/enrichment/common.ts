import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/server/db/generated/client";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { lockCatalogWrites } from "@/server/repositories/catalog/management";
import { readAccessoryEnrichmentTarget } from "@/server/repositories/catalog/enrichment";
import { readEnrichmentTarget } from "@/server/repositories/catalog/enrichment";
import * as repository from "@/server/repositories/enrichment";
import {
  enrichmentTarget,
  type EnrichmentTarget,
} from "@/features/enrichment/validation";
import { playtimeSet } from "@/features/games/playtime-validation";
import { storedTrailer } from "@/features/games/trailer-validation";
import { EnrichmentError } from "./errors";

export const snapshotSchema = z.strictObject({
  target: enrichmentTarget,
  label: z.string().max(1000),
  revision: z.number().int().positive(),
  archived: z.boolean(),
  identity: z.json(),
  fields: z.record(z.string(), z.json()),
});
export type TargetSnapshot = z.infer<typeof snapshotSchema>;
// JSONB reorders object keys. Compare canonical JSON while preserving array order.
const stableJson = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export const hash = (value: unknown) =>
  createHash("sha256").update(stableJson(value)).digest("hex");
export const equal = (left: unknown, right: unknown) =>
  stableJson(left) === stableJson(right);
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const jsonNullable = (value: unknown) =>
  value === null ? Prisma.JsonNull : json(value);
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new EnrichmentError("INVALID_INPUT");
  return result.data;
}
export function bounded(value: unknown, max = 1024 * 1024) {
  if (Buffer.byteLength(JSON.stringify(value)) > max)
    throw new EnrichmentError("INVALID_INPUT");
}
export function failure(error: unknown): never {
  if (
    error instanceof EnrichmentError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new EnrichmentError("UNAVAILABLE");
}
export async function guarded<T>(
  context: PrivateAccessContext,
  work: (actor: PrivateAccessContext, tx: TransactionClient) => Promise<T>,
  accept = false,
  deadlineAt?: number,
) {
  try {
    const remaining =
      deadlineAt === undefined
        ? undefined
        : Math.floor(deadlineAt - performance.now());
    if (remaining !== undefined && remaining < 2)
      throw new EnrichmentError("TIMEOUT");
    const maxWait =
      remaining === undefined
        ? 5000
        : Math.max(1, Math.min(1000, Math.floor(remaining / 4)));
    return await withTransaction(
      async (tx) => {
        await requirePermission(
          context,
          accept ? "enrichment.accept" : "enrichment.suggest",
          tx,
        );
        await lockCatalogWrites(tx);
        const actor = await requirePermission(
          context,
          accept ? "enrichment.accept" : "enrichment.suggest",
          tx,
        );
        if (accept) await requirePermission(context, "catalog.manage", tx);
        return work(actor, tx);
      },
      remaining === undefined
        ? {}
        : {
            maxWait,
            timeout: Math.max(1, Math.min(10000, remaining - maxWait)),
          },
    );
  } catch (error) {
    if (deadlineAt !== undefined && performance.now() >= deadlineAt)
      throw new EnrichmentError("TIMEOUT");
    failure(error);
  }
}
export function targetOf(run: repository.Run): EnrichmentTarget {
  if (run.gameId) return { kind: "game", id: run.gameId };
  if (run.gameReleaseId) return { kind: "release", id: run.gameReleaseId };
  if (run.accessoryId) return { kind: "accessory", id: run.accessoryId };
  if (run.accessoryVariantId)
    return { kind: "variant", id: run.accessoryVariantId };
  throw new EnrichmentError("NOT_FOUND");
}
export async function authorizedRun(
  id: string,
  actor: PrivateAccessContext,
  tx: TransactionClient,
) {
  const run = await repository.findRun(id, tx);
  if (!run || (actor.role !== "ADMIN" && run.requestedById !== actor.userId))
    throw new EnrichmentError("NOT_FOUND");
  targetOf(run);
  if (
    run.accessoryId || run.accessoryVariantId
      ? run.provider !== "WIKIDATA"
      : run.provider !== "IGDB"
  )
    throw new EnrichmentError("UNAVAILABLE");
  if (run.snapshotSchemaVersion !== 1 || run.pipelineVersion !== "1")
    throw new EnrichmentError("UNAVAILABLE");
  return run;
}
export async function loadTarget(
  target: EnrichmentTarget,
  tx: TransactionClient,
): Promise<TargetSnapshot> {
  if (target.kind === "accessory" || target.kind === "variant") {
    const record = await readAccessoryEnrichmentTarget(
      target.kind,
      target.id,
      tx,
    );
    if (!record) throw new EnrichmentError("NOT_FOUND");
    const variant = "accessoryId" in record ? record : null;
    return snapshotSchema.parse({
      target,
      label: variant
        ? `${variant.accessory.name} · ${record.name} · ${record.slug}`
        : `${record.name} · ${record.slug}`,
      revision: record.revision,
      archived: Boolean(record.archivedAt || variant?.accessory.archivedAt),
      identity: variant
        ? {
            accessoryId: variant.accessoryId,
            accessoryRevision: variant.accessory.revision,
            modelNumber: variant.modelNumber,
            color: variant.color,
            edition: variant.edition,
            markets: variant.regions.map((r) => r.regionId),
            platforms: variant.platforms.map((p) => ({
              id: p.platformId,
              note: p.compatibilityNote,
            })),
          }
        : { id: record.id },
      fields: {
        references: record.externalReferences.map((r) => ({ ...r })),
        name: record.name,
        description: "description" in record ? record.description : null,
        releaseYear: record.releaseYear,
        producerId: record.producerId,
        trailer: storedTrailer(record),
      },
    });
  }
  const loaded = await readEnrichmentTarget(target.kind, target.id, tx);
  if (!loaded) throw new EnrichmentError("NOT_FOUND");
  const { record, parent } = loaded;
  const playtime = loaded.playtime
    ? playtimeSet.parse({
        mainMinutes: loaded.playtime.mainMinutes,
        mainExtrasMinutes: loaded.playtime.mainExtrasMinutes,
        completionistMinutes: loaded.playtime.completionistMinutes,
        sourceType: loaded.playtime.sourceType,
        sourceName: loaded.playtime.sourceName,
        sourceUrl: loaded.playtime.sourceUrl,
        observedAt: loaded.playtime.observedAt.toISOString(),
      })
    : null;
  const common = {
    references: record.externalReferences.map((ref) => ({ ...ref })),
    trailer: loaded.trailer ? storedTrailer(loaded.trailer) : null,
    playtime,
  };
  if ("gameId" in record)
    return snapshotSchema.parse({
      target,
      label: `${record.game.name} · ${record.platform.name} · ${record.slug}`,
      revision: record.revision,
      archived: Boolean(
        record.archivedAt ||
        parent?.game.archivedAt ||
        parent?.platform.archivedAt,
      ),
      identity: {
        gameId: record.gameId,
        platformId: record.platformId,
        gameRevision: parent?.game.revision,
        platformRevision: parent?.platform.revision,
        editionType: record.editionType,
        editionName: record.editionName,
        printingLabel: record.printingLabel,
        marketIds: record.regions.map((market) => market.regionId),
      },
      fields: {
        ...common,
        descriptionOverride: record.descriptionOverride,
        firstReleaseYear: record.firstReleaseYear,
        markets: record.regions.map((market) => ({
          regionId: market.regionId,
          year: market.releaseYear,
          month: market.releaseMonth,
          day: market.releaseDay,
        })),
        credits: record.companies.map(
          ({ companyId, role, regionId, creditLabel }) => ({
            companyId,
            role,
            regionId,
            creditLabel,
          }),
        ),
      },
    });
  return snapshotSchema.parse({
    target,
    label: `${record.name} · ${record.slug}`,
    revision: record.revision,
    archived: Boolean(record.archivedAt),
    identity: { id: record.id },
    fields: {
      ...common,
      name: record.name,
      description: record.description,
      aliases: record.aliases,
      developers: record.companies.map(({ companyId, creditLabel }) => ({
        companyId,
        creditLabel,
      })),
    },
  });
}
export function unchanged(run: repository.Run, current: TargetSnapshot) {
  const base = snapshotSchema.safeParse(run.targetSnapshot);
  return (
    base.success &&
    !current.archived &&
    current.revision === run.targetBaseRevision &&
    equal(current.identity, base.data.identity)
  );
}
export function manualReplacement(before: unknown, origin: string | undefined) {
  const populated =
    before !== null &&
    before !== "" &&
    (!Array.isArray(before) || before.length > 0);
  return populated && (origin === undefined || origin === "MANUAL");
}
export async function recoverExpired(
  run: repository.Run,
  tx: TransactionClient,
  now: Date,
) {
  if (
    run.fetchStatus === "RUNNING" &&
    run.leaseUntil &&
    run.leaseUntil <= now
  ) {
    const attempts = z.array(z.json()).parse(run.attempts);
    const latest = attempts.at(-1);
    if (latest && typeof latest === "object" && !Array.isArray(latest))
      attempts[attempts.length - 1] = {
        ...latest,
        completedAt: now.toISOString(),
        code: "TIMEOUT",
      };
    return repository.updateRun(
      run.id,
      {
        fetchStatus: "FAILED",
        failureCode: "TIMEOUT",
        completedAt: now,
        leaseUntil: null,
        operationToken: null,
        attempts: json(attempts),
      },
      tx,
    );
  }
  return run;
}
