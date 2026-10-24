import "server-only";
import { Prisma } from "@/server/db/generated/client";
import type { PrivateAccessContext } from "@/server/auth/access";
import { PrivateAccessError } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import * as repository from "@/server/repositories/catalog/accessories";
import * as shared from "@/server/repositories/catalog/management";
import {
  accessorySave,
  accessoryArchive,
  accessoryPage,
  compatibilitySource,
  accessoryIdentity,
  accessoryFields,
  variantFields,
  type AccessoryKind,
} from "@/features/accessories/validation";
import type { AccessoryCatalogRecord } from "@/features/accessories/contracts";
import { normalizedWebUrl } from "@/features/catalog/validation";
import {
  storedTrailer,
  type TrailerReference,
} from "@/features/games/trailer-validation";
import { CatalogError } from "./management";
import { describeMetadataSource } from "./provenance";
type Row = NonNullable<
  Awaited<ReturnType<typeof repository.findAccessoryCatalog>>
>;
type Variant = Extract<Row, { accessoryId: string }>;
const option = (r: {
  id: string;
  name: string;
  slug: string;
  archivedAt: Date | null;
}) => ({
  id: r.id,
  name: r.name,
  detail: r.slug,
  archived: r.archivedAt !== null,
});
const specsText = (v: Prisma.JsonValue) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (JSON.stringify(v.data, null, 2) ?? "")
    : "";
function accessoryCatalogDto(r: Row): AccessoryCatalogRecord {
  const common = {
    id: r.id,
    revision: r.revision,
    archived: r.archivedAt !== null,
    references: r.externalReferences.map((v) => ({
      ...v,
      providerObjectType: v.providerObjectType ?? "",
      externalId: v.externalId ?? "",
      url: v.url ?? "",
    })),
  };
  const fields = {
    name: r.name,
    slug: r.slug,
    producerId: r.producerId ?? "",
    releaseYear: r.releaseYear?.toString() ?? "",
    trailer: storedTrailer(r),
  };
  if ("accessoryId" in r)
    return {
      ...common,
      kind: "variant",
      name: `${r.accessory.name} · ${r.name}`,
      fields: {
        ...fields,
        accessoryId: r.accessoryId,
        modelNumber: r.modelNumber ?? "",
        color: r.color ?? "",
        edition: r.edition ?? "",
        descriptionOverride: r.descriptionOverride ?? "",
        specificationsOverride: specsText(r.specificationsOverride),
        regionLock: r.regionLock ?? "",
        regionLockNote: r.regionLockNote ?? "",
        identificationStatus: r.identificationStatus,
        regionIds: r.regions.map((v) => v.regionId),
        platforms: r.platforms.map((p) => ({
          platformId: p.platformId,
          compatibilityNote: p.compatibilityNote ?? "",
        })),
      },
      options: {
        company: r.producer ? [option(r.producer)] : [],
        accessory: [option(r.accessory)],
        platform: r.platforms.map((p) => option(p.platform)),
        region: r.regions.map((m) => option(m.region)),
      },
    };
  return {
    ...common,
    kind: "accessory",
    name: r.name,
    fields: {
      ...fields,
      description: r.description ?? "",
      specifications: specsText(r.specifications),
    },
    options: {
      company: r.producer ? [option(r.producer)] : [],
      accessory: [],
      platform: [],
      region: [],
    },
  };
}
function fail(e: unknown): never {
  if (
    e instanceof CatalogError ||
    e instanceof PrivateAccessError ||
    e instanceof PermissionError
  )
    throw e;
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003"].includes(e.code)
  )
    throw new CatalogError(
      "INVALID_INPUT",
      "A slug is already used, or a linked record changed. Refresh and review your entries.",
    );
  throw new CatalogError("UNAVAILABLE");
}
function snapshot(r: Row) {
  const dto = accessoryCatalogDto(r);
  return {
    ...(dto.kind === "accessory"
      ? accessoryFields.parse(dto.fields)
      : variantFields.parse(dto.fields)),
    references: r.externalReferences,
    archivedAt: r.archivedAt?.toISOString() ?? null,
  };
}
async function audit(
  kind: AccessoryKind,
  id: string,
  actorId: string,
  before: Row | null,
  after: Row,
  tx: TransactionClient,
) {
  const old = before ? snapshot(before) : {};
  const json = (v: unknown) =>
    v == null
      ? Prisma.JsonNull
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
  const changes = Object.entries(snapshot(after))
    .filter(
      ([k, v]) =>
        JSON.stringify(Reflect.get(old, k) ?? null) !== JSON.stringify(v),
    )
    .map(([fieldPath, v]) => ({
      fieldPath,
      before: json(Reflect.get(old, fieldPath)),
      after: json(v),
    }));
  if (changes.length)
    await shared.appendCatalogHistory(
      kind,
      id,
      after.revision,
      actorId,
      changes,
      tx,
    );
}
async function linked(
  kind: "accessory" | "company" | "platform" | "region",
  id: string,
  retained: boolean,
  tx: TransactionClient,
) {
  const row =
    kind === "accessory"
      ? await repository.findAccessoryCatalog("accessory", id, tx)
      : await shared.findCatalogRecord(kind, id, tx);
  if (!row || (row.archivedAt && !retained))
    throw new CatalogError(
      "INVALID_INPUT",
      "Choose an active linked record. Previously archived links may be retained.",
    );
  return row;
}
async function linkedMany(
  kind: "platform" | "region",
  ids: string[],
  retained: string[],
  tx: TransactionClient,
) {
  const rows = await repository.accessoryLinks(kind, ids, tx);
  if (
    rows.length !== ids.length ||
    rows.some((r) => r.archivedAt && !retained.includes(r.id))
  )
    throw new CatalogError(
      "INVALID_INPUT",
      "Choose active linked records. Previously archived links may be retained.",
    );
  return rows;
}
export async function getAccessoryCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const p = accessoryPage.safeParse(input);
        if (!p.success) throw new CatalogError("NOT_FOUND");
        const q = p.data;
        const rows = await repository.listAccessoryCatalog(
          q.kind,
          q.page,
          q.archived,
          tx,
        );
        const row = q.id
          ? await repository.findAccessoryCatalog(q.kind, q.id, tx)
          : null;
        if (q.id && !row) throw new CatalogError("NOT_FOUND");
        const history = row
          ? await shared.listCatalogHistory(q.kind, row.id, tx)
          : [];
        const union =
          row && q.kind === "accessory"
            ? await repository.familyPlatforms(row.id, tx)
            : [];
        return {
          ...q,
          records: rows.slice(0, 25).map((r) => ({
            id: r.id,
            slug: r.slug,
            name: r.accessory ? `${r.accessory.name} · ${r.name}` : r.name,
            archived: r.archivedAt !== null,
          })),
          hasNext: rows.length > 25,
          selected: row ? accessoryCatalogDto(row) : null,
          familyCompatibility: union.slice(0, 30).map(option),
          moreFamilyCompatibility: union.length > 30,
          history: history.map((h) => ({
            id: h.id,
            fieldPath: h.fieldPath,
            revision: h.rootRevision,
            createdAt: h.createdAt.toISOString(),
            attribution: describeMetadataSource(h),
            before: JSON.stringify(h.before),
            after: JSON.stringify(h.after),
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
function videoColumns(value: TrailerReference | null, before: Row | null) {
  return {
    trailerProvider: value?.provider ?? null,
    trailerId: value?.provider === "YOUTUBE" ? value.id : null,
    trailerUrl: value?.provider === "DIRECT_URL" ? value.url : null,
    trailerPublicApproved:
      !!before &&
      JSON.stringify(storedTrailer(before)) === JSON.stringify(value) &&
      before.trailerPublicApproved,
  };
}
async function copySource(
  input: { accessoryId: string; sourceId: string },
  tx: TransactionClient,
) {
  const row = await repository.findAccessoryCatalog(
    "variant",
    input.sourceId,
    tx,
  );
  if (
    !row ||
    !("accessoryId" in row) ||
    row.accessoryId !== input.accessoryId ||
    row.archivedAt ||
    row.accessory.archivedAt
  )
    throw new CatalogError(
      "INVALID_INPUT",
      "Choose an active source variant from the same accessory family.",
    );
  return row;
}
export async function getAccessoryCompatibilityDraft(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const p = compatibilitySource.safeParse(input);
        if (!p.success) throw new CatalogError("INVALID_INPUT");
        const r = await copySource(p.data, tx);
        return {
          sourceId: r.id,
          sourceRevision: r.revision,
          platforms: r.platforms.map((p) => ({
            platformId: p.platformId,
            compatibilityNote: p.compatibilityNote ?? "",
          })),
          options: r.platforms.map((p) => option(p.platform)),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
export async function saveAccessoryCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const p = accessorySave.safeParse(input);
      if (!p.success)
        throw new CatalogError(
          "INVALID_INPUT",
          p.error.issues
            .slice(0, 4)
            .map((i) => i.message)
            .join(" "),
        );
      const d = p.data;
      await shared.lockCatalogWrites(tx);
      const actor = await requirePermission(context, "catalog.manage", tx);
      const before = d.id
        ? await repository.findAccessoryCatalog(d.kind, d.id, tx)
        : null;
      if (d.id && !before) throw new CatalogError("NOT_FOUND");
      if (before && before.revision !== d.expectedRevision)
        throw new CatalogError("STALE");
      if (before?.archivedAt)
        throw new CatalogError(
          "INVALID_INPUT",
          "Restore this record before editing.",
        );
      if (
        d.references.some(
          (r) => r.id && !before?.externalReferences.some((v) => v.id === r.id),
        )
      )
        throw new CatalogError(
          "INVALID_INPUT",
          "An external reference belongs to another record.",
        );
      if (d.fields.producerId)
        await linked(
          "company",
          d.fields.producerId,
          before?.producerId === d.fields.producerId,
          tx,
        );
      let saved: { id: string; revision: number };
      if (d.kind === "accessory") {
        const { trailer, specifications, ...f } = d.fields;
        saved = await repository.saveAccessory(
          {
            ...f,
            specifications: specifications ?? Prisma.DbNull,
            ...videoColumns(trailer, before),
          },
          d.id,
          tx,
        );
      } else {
        const f = d.fields,
          old = before && "accessoryId" in before ? before : null;
        await linked(
          "accessory",
          f.accessoryId,
          old?.accessoryId === f.accessoryId,
          tx,
        );
        if (d.compatibilityCopy) {
          const source = await copySource(
            {
              accessoryId: f.accessoryId,
              sourceId: d.compatibilityCopy.sourceId,
            },
            tx,
          );
          if (source.revision !== d.compatibilityCopy.sourceRevision)
            throw new CatalogError(
              "STALE",
              "The source compatibility changed. Load and review it again before saving.",
            );
        }
        const markets = await linkedMany(
          "region",
          f.regionIds,
          old?.regions.map((r) => r.regionId) ?? [],
          tx,
        );
        if (
          markets.length > 1 &&
          markets.some(
            (m) =>
              "code" in m &&
              (m.code === "WW" || m.name.toLowerCase() === "worldwide"),
          )
        )
          throw new CatalogError(
            "INVALID_INPUT",
            "Worldwide cannot be combined with specific markets.",
          );
        await linkedMany(
          "platform",
          f.platforms.map((p) => p.platformId),
          old?.platforms.map((p) => p.platformId) ?? [],
          tx,
        );
        const {
          platforms,
          regionIds,
          specificationsOverride,
          trailer,
          ...fields
        } = f;
        saved = await repository.saveVariant(
          {
            ...fields,
            specificationsOverride: specificationsOverride ?? Prisma.DbNull,
            ...videoColumns(trailer, before),
          },
          d.id,
          tx,
        );
        await repository.setVariantRelations(
          saved.id,
          regionIds,
          platforms,
          tx,
        );
      }
      await shared.setCatalogReferences(
        d.kind,
        saved.id,
        d.references.map((r) => ({
          ...r,
          normalizedUrl: r.url ? normalizedWebUrl(r.url) : null,
        })),
        tx,
      );
      const after = (await repository.findAccessoryCatalog(
        d.kind,
        saved.id,
        tx,
      ))!;
      await audit(d.kind, saved.id, actor.userId, before, after, tx);
      return saved.id;
    });
  } catch (e) {
    fail(e);
  }
}
export async function archiveAccessoryCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const p = accessoryArchive.safeParse(input);
      if (!p.success) throw new CatalogError("INVALID_INPUT");
      const d = p.data;
      await shared.lockCatalogWrites(tx);
      const actor = await requirePermission(context, "catalog.manage", tx);
      const before = await repository.findAccessoryCatalog(d.kind, d.id, tx);
      if (!before) throw new CatalogError("NOT_FOUND");
      if (before.revision !== d.expectedRevision)
        throw new CatalogError("STALE");
      if (Boolean(before.archivedAt) === d.archived) return d.id;
      await repository.archiveAccessoryCatalog(d.kind, d.id, d.archived, tx);
      await audit(
        d.kind,
        d.id,
        actor.userId,
        before,
        (await repository.findAccessoryCatalog(d.kind, d.id, tx))!,
        tx,
      );
      return d.id;
    });
  } catch (e) {
    fail(e);
  }
}
// Whole-field/group fallback; compatibility always comes from this variant.
export function accessoryDomainDto(r: Variant) {
  const effective = <T>(variant: T | null, family: T | null) => ({
    value: variant ?? family,
    scope:
      variant !== null
        ? ("variant" as const)
        : family !== null
          ? ("family" as const)
          : ("unknown" as const),
  });
  return {
    family: { ...option(r.accessory), revision: r.accessory.revision },
    variant: {
      ...option(r),
      revision: r.revision,
      modelNumber: r.modelNumber,
      color: r.color,
      edition: r.edition,
      identificationStatus: r.identificationStatus,
      regionLock: r.regionLock,
      regionLockNote: r.regionLockNote,
    },
    compatibility: r.platforms.map((p) => ({
      ...option(p.platform),
      note: p.compatibilityNote,
    })),
    markets: r.regions.map((m) => option(m.region)),
    description: effective(r.descriptionOverride, r.accessory.description),
    specifications: effective(
      r.specificationsOverride,
      r.accessory.specifications,
    ),
    video: effective(storedTrailer(r), storedTrailer(r.accessory)),
    releaseYear: effective(r.releaseYear, r.accessory.releaseYear),
    producer: effective(
      r.producer ? option(r.producer) : null,
      r.accessory.producer ? option(r.accessory.producer) : null,
    ),
  };
}
export async function getAccessoryDomain(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        const p = accessoryIdentity.safeParse(input);
        if (!p.success) throw new CatalogError("NOT_FOUND");
        const r = await repository.findAccessoryCatalog(
          "variant",
          p.data.id,
          tx,
        );
        if (!r || !("accessoryId" in r)) throw new CatalogError("NOT_FOUND");
        return accessoryDomainDto(r);
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    fail(e);
  }
}
