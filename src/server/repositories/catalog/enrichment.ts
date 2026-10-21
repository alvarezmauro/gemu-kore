import "server-only";
import { Prisma } from "../../db/generated/client";
import type { TransactionClient } from "../../db/transaction";
import { findAccessoryCatalog } from "./accessories";
import { findGameCatalog } from "./games";
import { playtimeRecord } from "./playtime";
import { trailerRecord } from "./trailers";

export async function readEnrichmentTarget(
  kind: "game" | "release",
  id: string,
  tx: TransactionClient,
) {
  const record = await findGameCatalog(kind, id, tx);
  if (!record) return null;
  const [playtime, trailer, parent] = await Promise.all([
    playtimeRecord(kind, id, tx),
    trailerRecord(kind, id, tx),
    "gameId" in record
      ? tx.gameRelease.findUnique({
          where: { id },
          select: {
            game: { select: { id: true, revision: true, archivedAt: true } },
            platform: {
              select: { id: true, revision: true, archivedAt: true },
            },
          },
        })
      : null,
  ]);
  return { record, playtime: playtime?.playtime ?? null, trailer, parent };
}
export function companies(ids: string[], tx: TransactionClient) {
  return tx.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, revision: true, archivedAt: true },
    take: 30,
  });
}
export function mappedCompanies(
  ids: string[],
  tx: TransactionClient,
  provider: "IGDB" | "WIKIDATA" = "IGDB",
) {
  return tx.externalReference.findMany({
    where: {
      provider: { equals: provider.toLowerCase(), mode: "insensitive" },
      providerObjectType: {
        equals: provider === "IGDB" ? "COMPANY" : "ITEM",
        mode: "insensitive",
      },
      externalId: { in: ids },
      companyId: { not: null },
      company: { archivedAt: null },
    },
    select: { externalId: true, companyId: true },
    take: 61,
  });
}

// The outer acceptance service owns permission checks, guard and one revision bump.
export async function writeAcceptedFields(
  kind: "game" | "release" | "accessory" | "variant",
  id: string,
  fields: {
    releaseYear?: number;
    producerId?: string;
    name?: string;
    description?: string;
    aliases?: string[];
    descriptionOverride?: string;
    firstReleaseYear?: number;
    trailer?:
      | { provider: "YOUTUBE"; id: string }
      | { provider: "DIRECT_URL"; url: string };
  },
  tx: TransactionClient,
) {
  const { trailer, ...scalar } = fields;
  const media = trailer
    ? {
        trailerProvider: trailer.provider,
        trailerId: trailer.provider === "YOUTUBE" ? trailer.id : null,
        trailerUrl: trailer.provider === "DIRECT_URL" ? trailer.url : null,
        trailerPublicApproved: false,
      }
    : {};
  if (kind === "accessory" || kind === "variant") {
    const data = {
      ...(scalar.name !== undefined ? { name: scalar.name } : {}),
      ...(scalar.releaseYear !== undefined
        ? { releaseYear: scalar.releaseYear }
        : {}),
      ...(scalar.producerId !== undefined
        ? { producerId: scalar.producerId }
        : {}),
      ...media,
      revision: { increment: 1 },
    };
    return kind === "accessory"
      ? tx.accessory.update({
          where: { id },
          data: {
            ...data,
            ...(scalar.description !== undefined
              ? { description: scalar.description }
              : {}),
          },
          select: { revision: true },
        })
      : tx.accessoryVariant.update({
          where: { id },
          data,
          select: { revision: true },
        });
  }
  if (kind === "game") {
    const { name, description, aliases } = scalar;
    return tx.game.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(aliases ? { aliases } : {}),
        ...media,
        revision: { increment: 1 },
      },
      select: { revision: true },
    });
  }
  return tx.gameRelease.update({
    where: { id },
    data: {
      ...(scalar.descriptionOverride !== undefined
        ? { descriptionOverride: scalar.descriptionOverride }
        : {}),
      ...(scalar.firstReleaseYear !== undefined
        ? { firstReleaseYear: scalar.firstReleaseYear }
        : {}),
      ...media,
      revision: { increment: 1 },
    },
    select: { revision: true },
  });
}
export function writeAcceptedPlaytime(
  kind: "game" | "release",
  id: string,
  estimates: {
    mainMinutes: number | null;
    mainExtrasMinutes: number | null;
    completionistMinutes: number | null;
    sourceType: "PROVIDER";
    sourceName: string;
    sourceUrl: string | null;
    observedAt: Date;
  },
  tx: TransactionClient,
) {
  const where = kind === "game" ? { gameId: id } : { gameReleaseId: id };
  return tx.gamePlaytime.upsert({
    where,
    create: { ...where, ...estimates },
    update: estimates,
  });
}
export async function recordAcceptedChange(
  data: {
    kind: "game" | "release" | "accessory" | "variant";
    targetId: string;
    fieldPath: string;
    revision: number;
    actorId: string;
    before: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    after: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    sourceSnapshot: Prisma.InputJsonValue;
    suggestionId: string;
  },
  tx: TransactionClient,
) {
  return tx.metadataChange.create({
    data: {
      ...targetPointer(data.kind, data.targetId),
      fieldPath: data.fieldPath,
      rootRevision: data.revision,
      actorId: data.actorId,
      before: data.before,
      after: data.after,
      origin: "PROVIDER",
      sourceSnapshot: data.sourceSnapshot,
      enrichmentSuggestionId: data.suggestionId,
    },
    select: { id: true },
  });
}

export function targetPointer(
  kind: "game" | "release" | "accessory" | "variant",
  id: string,
) {
  switch (kind) {
    case "game":
      return { gameId: id };
    case "release":
      return { gameReleaseId: id };
    case "accessory":
      return { accessoryId: id };
    case "variant":
      return { accessoryVariantId: id };
  }
}
export function readAccessoryEnrichmentTarget(
  kind: "accessory" | "variant",
  id: string,
  tx: TransactionClient,
) {
  return findAccessoryCatalog(kind, id, tx);
}
