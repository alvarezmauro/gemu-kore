import "server-only";
import { Prisma } from "../../db/generated/client";
import type { TransactionClient } from "../../db/transaction";

type Kind = "company" | "region" | "platform" | "model";
type TargetKind = Kind | "game" | "release" | "accessory" | "variant";
const identity = { id: true, name: true, archivedAt: true } as const;
const base = {
  ...identity,
  slug: true,
  revision: true,
  description: true,
} as const;
const references = {
  select: {
    id: true,
    provider: true,
    providerObjectType: true,
    externalId: true,
    url: true,
  },
  orderBy: { id: "asc" as const },
};
const companySelect = {
  ...base,
  countryCode: true,
  foundedYear: true,
  website: true,
  aliases: true,
  externalReferences: references,
} as const;
const regionSelect = { ...base, code: true } as const;
const platformSelect = {
  ...base,
  manufacturerId: true,
  manufacturer: { select: identity },
  generation: true,
  originalReleaseYear: true,
  discontinuedYear: true,
  history: true,
  aliases: true,
  externalReferences: references,
} as const;
const modelSelect = {
  ...base,
  platformId: true,
  platform: { select: identity },
  manufacturerId: true,
  manufacturer: { select: identity },
  modelNumber: true,
  releaseYear: true,
  discontinuedYear: true,
  specifications: true,
  widthMm: true,
  heightMm: true,
  depthMm: true,
  weightGrams: true,
  regionLock: true,
  regionLockNote: true,
  identificationStatus: true,
  regions: {
    select: { region: { select: identity } },
    orderBy: { regionId: "asc" as const },
  },
  externalReferences: references,
} as const;
export function target(kind: TargetKind, id: string) {
  switch (kind) {
    case "company":
      return { companyId: id };
    case "region":
      return { regionId: id };
    case "platform":
      return { platformId: id };
    case "model":
      return { consoleModelId: id };
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
export async function findCatalogRecord(
  kind: Kind,
  id: string,
  tx: TransactionClient,
) {
  switch (kind) {
    case "company":
      return tx.company.findUnique({ where: { id }, select: companySelect });
    case "region":
      return tx.region.findUnique({ where: { id }, select: regionSelect });
    case "platform":
      return tx.consolePlatform.findUnique({
        where: { id },
        select: platformSelect,
      });
    case "model":
      return tx.consoleModel.findUnique({ where: { id }, select: modelSelect });
  }
}
export async function listCatalogRecords(
  kind: Kind,
  page: number,
  archived: "active" | "archived" | "all",
  tx: TransactionClient,
) {
  const where =
    archived === "all"
      ? {}
      : { archivedAt: archived === "active" ? null : { not: null } };
  const args = {
    where,
    select: { ...identity, slug: true, revision: true },
    orderBy: [{ name: "asc" as const }, { id: "asc" as const }],
    skip: (page - 1) * 25,
    take: 26,
  };
  switch (kind) {
    case "company":
      return tx.company.findMany(args);
    case "region":
      return tx.region.findMany(args);
    case "platform":
      return tx.consolePlatform.findMany(args);
    case "model":
      return tx.consoleModel.findMany(args);
  }
}
export async function lookupCatalogRecords(
  kind: Exclude<Kind, "model"> | "game" | "accessory" | "variant",
  query: string,
  tx: TransactionClient,
) {
  // Escape LIKE metacharacters; a name containing '%' or '_' is literal text.
  const literal = query.replace(/[\\%_]/g, "\\$&");
  const args = {
    where: {
      archivedAt: null,
      name: { contains: literal, mode: "insensitive" as const },
    },
    select: identity,
    orderBy: [{ name: "asc" as const }, { id: "asc" as const }],
    take: 25,
  };
  switch (kind) {
    case "accessory":
      return tx.accessory.findMany({
        ...args,
        where: {
          archivedAt: null,
          OR: [
            { name: { contains: literal, mode: "insensitive" } },
            { slug: { contains: literal, mode: "insensitive" } },
          ],
        },
        select: { ...identity, slug: true },
      });
    case "variant":
      return tx.accessoryVariant
        .findMany({
          ...args,
          where: {
            archivedAt: null,
            accessory: { archivedAt: null },
            OR: [
              { name: { contains: literal, mode: "insensitive" } },
              { slug: { contains: literal, mode: "insensitive" } },
            ],
          },
          select: {
            ...identity,
            slug: true,
            accessory: { select: { name: true } },
          },
        })
        .then((rows) =>
          rows.map((r) => ({ ...r, name: `${r.accessory.name} · ${r.name}` })),
        );
    case "game":
      return tx.game.findMany({
        ...args,
        select: { ...identity, slug: true },
        where: {
          archivedAt: null,
          OR: [
            { name: { contains: literal, mode: "insensitive" } },
            { slug: { contains: literal, mode: "insensitive" } },
          ],
        },
      });
    case "company":
      return tx.company.findMany(args);
    case "region":
      return tx.region.findMany(args);
    case "platform":
      return tx.consolePlatform.findMany(args);
  }
}
export async function lockCatalogWrites(tx: TransactionClient) {
  // Small shared catalog: serialize admin writes, including market/reference edits.
  // The transaction-local timeout bounds contention; no network work runs here.
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(71482, 1)::text`;
}
type CatalogWrite =
  | { kind: "company"; data: Prisma.CompanyUncheckedCreateInput }
  | { kind: "region"; data: Prisma.RegionUncheckedCreateInput }
  | { kind: "platform"; data: Prisma.ConsolePlatformUncheckedCreateInput }
  | { kind: "model"; data: Prisma.ConsoleModelUncheckedCreateInput };
export async function writeCatalogRecord(
  input: CatalogWrite,
  id: string | undefined,
  tx: TransactionClient,
) {
  // Each branch uses an explicit delegate; arbitrary client table/field names never reach Prisma.
  switch (input.kind) {
    case "company":
      return id
        ? tx.company.update({
            where: { id },
            data: { ...input.data, revision: { increment: 1 } },
            select: { id: true, revision: true },
          })
        : tx.company.create({
            data: input.data,
            select: { id: true, revision: true },
          });
    case "region":
      return id
        ? tx.region.update({
            where: { id },
            data: { ...input.data, revision: { increment: 1 } },
            select: { id: true, revision: true },
          })
        : tx.region.create({
            data: input.data,
            select: { id: true, revision: true },
          });
    case "platform":
      return id
        ? tx.consolePlatform.update({
            where: { id },
            data: { ...input.data, revision: { increment: 1 } },
            select: { id: true, revision: true },
          })
        : tx.consolePlatform.create({
            data: input.data,
            select: { id: true, revision: true },
          });
    case "model":
      return id
        ? tx.consoleModel.update({
            where: { id },
            data: { ...input.data, revision: { increment: 1 } },
            select: { id: true, revision: true },
          })
        : tx.consoleModel.create({
            data: input.data,
            select: { id: true, revision: true },
          });
  }
}
export async function archiveCatalogRecord(
  kind: Kind,
  id: string,
  archived: boolean,
  tx: TransactionClient,
) {
  const data = {
    archivedAt: archived ? new Date() : null,
    revision: { increment: 1 },
  };
  switch (kind) {
    case "company":
      return tx.company.update({ where: { id }, data });
    case "region":
      return tx.region.update({ where: { id }, data });
    case "platform":
      return tx.consolePlatform.update({ where: { id }, data });
    case "model":
      return tx.consoleModel.update({ where: { id }, data });
  }
}
export async function setModelMarkets(
  id: string,
  regionIds: string[],
  tx: TransactionClient,
) {
  await tx.consoleModelRegion.deleteMany({
    where: { consoleModelId: id, regionId: { notIn: regionIds } },
  });
  await tx.consoleModelRegion.createMany({
    data: regionIds.map((regionId) => ({ consoleModelId: id, regionId })),
    skipDuplicates: true,
  });
}
export async function setCatalogReferences(
  kind: Exclude<TargetKind, "region">,
  id: string,
  refs: {
    id?: string;
    provider: string;
    providerObjectType: string | null;
    externalId: string | null;
    url: string | null;
    normalizedUrl: string | null;
  }[],
  tx: TransactionClient,
) {
  const parent = target(kind, id);
  // Keep metadata and IDs on retained references; never accept metadata/target FKs from input.
  // Temporarily remove retained identity keys so a valid identity swap is atomic.
  await tx.externalReference.deleteMany({
    where: {
      ...parent,
      id: { notIn: refs.flatMap((r) => (r.id ? [r.id] : [])) },
    },
  });
  for (const ref of refs)
    if (ref.id)
      await tx.externalReference.update({
        where: { id: ref.id, ...parent },
        data: { provider: `pending-${ref.id}` },
      });
  for (const ref of refs) {
    const { id: referenceId, ...data } = ref;
    if (referenceId)
      await tx.externalReference.update({
        where: { id: referenceId, ...parent },
        data,
      });
    else await tx.externalReference.create({ data: { ...data, ...parent } });
  }
}
export async function appendCatalogHistory(
  kind: TargetKind,
  id: string,
  revision: number,
  actorId: string,
  changes: {
    fieldPath: string;
    before: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    after: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }[],
  tx: TransactionClient,
) {
  await tx.metadataChange.createMany({
    data: changes.map((change) => ({
      ...target(kind, id),
      ...change,
      rootRevision: revision,
      origin: "MANUAL",
      actorId,
    })),
  });
}
export function listCatalogHistory(
  kind: TargetKind,
  id: string,
  tx: TransactionClient,
) {
  return tx.metadataChange.findMany({
    where: target(kind, id),
    select: {
      id: true,
      fieldPath: true,
      before: true,
      after: true,
      rootRevision: true,
      origin: true,
      sourceSnapshot: true,
      snapshotSchemaVersion: true,
      createdAt: true,
    },
    orderBy: [{ rootRevision: "desc" }, { fieldPath: "asc" }],
    take: 50,
  });
}
