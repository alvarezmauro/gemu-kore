import "server-only";
import { Prisma } from "../../db/generated/client";
import type { PrivateAccessContext } from "../../auth/access";
import { PrivateAccessError } from "../../auth/access";
import { requirePermission, PermissionError } from "../../auth/permissions";
import { withTransaction, type TransactionClient } from "../../db/transaction";
import * as repository from "../../repositories/catalog/management";
import {
  catalogArchive,
  catalogLookup,
  catalogPage,
  catalogSave,
  normalizedWebUrl,
  type CatalogSave,
} from "@/features/catalog/validation";
import {
  catalogFields,
  type CatalogKind,
  type CatalogOption,
  type CatalogRecord,
} from "@/features/catalog/contracts";

const fieldLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(catalogFields)
      .flat()
      .map((field) => [field.key, field.label]),
  ),
  platformId: "Platform",
  manufacturerId: "Manufacturer",
  regionIds: "Commercial markets",
  regionLock: "Region lock",
  identificationStatus: "Identification",
  provider: "Provider",
  providerObjectType: "Object type",
  externalId: "External ID",
  url: "URL",
};
export class CatalogError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "CONFLICT" | "UNAVAILABLE",
    message?: string,
  ) {
    super(
      message ??
        {
          INVALID_INPUT: "Check the catalog details and try again.",
          NOT_FOUND: "This catalog record no longer exists.",
          STALE:
            "This record changed while you were editing. Your entries are still here. Reload the page to review the latest version before trying again.",
          CONFLICT:
            "This slug, market code or external reference is already in use. Choose a different value.",
          UNAVAILABLE:
            "The catalog is unavailable right now. Please try again in a moment.",
        }[code],
    );
  }
}
function rethrow(error: unknown): never {
  if (
    error instanceof CatalogError ||
    error instanceof PermissionError ||
    error instanceof PrivateAccessError
  )
    throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    throw new CatalogError("CONFLICT");
  throw new CatalogError("UNAVAILABLE");
}
function option(record: {
  id: string;
  name: string;
  archivedAt: Date | null;
}): CatalogOption {
  return {
    id: record.id,
    name: record.name,
    archived: record.archivedAt !== null,
  };
}
type RecordRow = NonNullable<
  Awaited<ReturnType<typeof repository.findCatalogRecord>>
>;
function snapshot(record: RecordRow) {
  const fields: Record<string, unknown> = {};
  const allowedFields = [
    "name",
    "slug",
    "description",
    "countryCode",
    "foundedYear",
    "website",
    "aliases",
    "code",
    "manufacturerId",
    "generation",
    "originalReleaseYear",
    "discontinuedYear",
    "history",
    "platformId",
    "modelNumber",
    "releaseYear",
    "specifications",
    "regionLock",
    "regionLockNote",
    "identificationStatus",
  ] as const;
  for (const key of allowedFields) {
    if (key in record) fields[key] = Reflect.get(record, key);
  }
  fields.archivedAt = record.archivedAt?.toISOString() ?? null;
  if ("widthMm" in record) {
    for (const key of [
      "widthMm",
      "heightMm",
      "depthMm",
      "weightGrams",
    ] as const)
      fields[key] = record[key]?.toString() ?? null;
    fields.regionIds = record.regions.map((r) => r.region.id).sort();
  }
  if ("externalReferences" in record)
    fields.externalReferences = record.externalReferences;
  return fields;
}
function dto(record: RecordRow, kind: CatalogKind): CatalogRecord {
  const values = snapshot(record);
  const fields: Record<string, string> = {};
  for (const field of catalogFields[kind]) {
    const value = values[field.key];
    fields[field.key] =
      field.key === "specifications"
        ? value
          ? JSON.stringify((value as { data: unknown }).data, null, 2)
          : ""
        : Array.isArray(value)
          ? value.join("\n")
          : value == null
            ? ""
            : String(value);
  }
  if ("platformId" in record) {
    fields.platformId = record.platformId;
    fields.identificationStatus = record.identificationStatus;
    fields.regionLock = record.regionLock ?? "";
  }
  if ("manufacturerId" in record)
    fields.manufacturerId = record.manufacturerId ?? "";
  return {
    id: record.id,
    name: record.name,
    revision: record.revision,
    archived: record.archivedAt !== null,
    fields,
    markets:
      "regions" in record ? record.regions.map((r) => option(r.region)) : [],
    platform: "platform" in record ? option(record.platform) : null,
    manufacturer:
      "manufacturer" in record && record.manufacturer
        ? option(record.manufacturer)
        : null,
    references:
      "externalReferences" in record
        ? record.externalReferences.map((r) => ({
            id: r.id,
            provider: r.provider,
            providerObjectType: r.providerObjectType ?? "",
            externalId: r.externalId ?? "",
            url: r.url ?? "",
          }))
        : [],
  };
}
export async function getCatalogManagement(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const parsed = catalogPage.safeParse(input);
        if (!parsed.success) throw new CatalogError("NOT_FOUND");
        const query = parsed.data;
        const rows = await repository.listCatalogRecords(
          query.kind,
          query.page,
          query.archived,
          tx,
        );
        const record = query.id
          ? await repository.findCatalogRecord(query.kind, query.id, tx)
          : null;
        if (query.id && !record) throw new CatalogError("NOT_FOUND");
        const history = record
          ? await repository.listCatalogHistory(query.kind, record.id, tx)
          : [];
        return {
          ...query,
          records: rows
            .slice(0, 25)
            .map((r) => ({ ...option(r), slug: r.slug })),
          hasNext: rows.length > 25,
          selected: record ? dto(record, query.kind) : null,
          history: history.map((h) => ({
            id: h.id,
            fieldPath: h.fieldPath,
            revision: h.rootRevision,
            origin: h.origin,
            createdAt: h.createdAt.toISOString(),
            before: JSON.stringify(h.before),
            after: JSON.stringify(h.after),
          })),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    rethrow(error);
  }
}
export async function lookupCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const parsed = catalogLookup.safeParse(input);
        if (!parsed.success) throw new CatalogError("INVALID_INPUT");
        return (
          await repository.lookupCatalogRecords(
            parsed.data.kind,
            parsed.data.query,
            tx,
          )
        ).map(option);
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    rethrow(error);
  }
}
async function validateRelations(
  data: CatalogSave,
  before: RecordRow | null,
  tx: TransactionClient,
) {
  const old = before ? snapshot(before) : {};
  const check = async (
    kind: "company" | "platform" | "region",
    id: string | null,
    retained: boolean,
  ) => {
    if (!id) return;
    const record = await repository.findCatalogRecord(kind, id, tx);
    if (!record || (record.archivedAt && !retained))
      throw new CatalogError(
        "INVALID_INPUT",
        "Choose an active company, platform or market. Existing archived links may be retained.",
      );
  };
  if (data.kind === "platform" || data.kind === "model")
    await check(
      "company",
      data.fields.manufacturerId,
      old.manufacturerId === data.fields.manufacturerId,
    );
  if (data.kind === "model") {
    await check(
      "platform",
      data.fields.platformId,
      old.platformId === data.fields.platformId,
    );
    const retained = new Set(Array.isArray(old.regionIds) ? old.regionIds : []);
    for (const id of data.fields.regionIds)
      await check("region", id, retained.has(id));
  }
  const retainedRefs = new Set(
    before && "externalReferences" in before
      ? before.externalReferences.map((r) => r.id)
      : [],
  );
  if (data.references.some((r) => r.id && !retainedRefs.has(r.id)))
    throw new CatalogError(
      "INVALID_INPUT",
      "An external reference does not belong to this record.",
    );
}
const json = (value: unknown) =>
  value === null || value === undefined
    ? Prisma.JsonNull
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
async function audit(
  kind: CatalogKind,
  id: string,
  revision: number,
  actorId: string,
  before: RecordRow | null,
  after: RecordRow,
  tx: TransactionClient,
) {
  const old = before ? snapshot(before) : {};
  const next = snapshot(after);
  const changes = Object.entries(next)
    .filter(
      ([key, value]) =>
        JSON.stringify(old[key] ?? null) !== JSON.stringify(value),
    )
    .map(([fieldPath, value]) => ({
      fieldPath,
      before: json(old[fieldPath]),
      after: json(value),
    }));
  if (changes.length)
    await repository.appendCatalogHistory(
      kind,
      id,
      revision,
      actorId,
      changes,
      tx,
    );
}
export async function saveCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const parsed = catalogSave.safeParse(input);
      if (!parsed.success)
        throw new CatalogError(
          "INVALID_INPUT",
          parsed.error.issues
            .map((issue) => {
              const path = issue.path;
              const label =
                path[0] === "fields"
                  ? (fieldLabels[String(path[1])] ?? "Details")
                  : path[0] === "references"
                    ? `External reference${typeof path[1] === "number" ? ` ${path[1] + 1}` : ""}${path[2] ? ` · ${fieldLabels[String(path[2])] ?? "Details"}` : ""}`
                    : "Details";
              return `${label}: ${issue.code === "unrecognized_keys" ? "The form contains unsupported details. Reload the page and try again." : issue.message}`;
            })
            .slice(0, 4)
            .join(" "),
        );
      const data = parsed.data;
      await repository.lockCatalogWrites(tx);
      const current = await requirePermission(context, "catalog.manage", tx);
      const before = data.id
        ? await repository.findCatalogRecord(data.kind, data.id, tx)
        : null;
      if (data.id && !before) throw new CatalogError("NOT_FOUND");
      if (before && before.revision !== data.expectedRevision)
        throw new CatalogError("STALE");
      if (before?.archivedAt)
        throw new CatalogError(
          "INVALID_INPUT",
          "Restore this record before editing it.",
        );
      await validateRelations(data, before, tx);
      let saved: { id: string; revision: number };
      if (data.kind === "model") {
        const { regionIds, specifications, ...fields } = data.fields;
        saved = await repository.writeCatalogRecord(
          {
            kind: "model",
            data: {
              ...fields,
              specifications:
                specifications === null ? Prisma.DbNull : json(specifications),
            },
          },
          data.id,
          tx,
        );
        await repository.setModelMarkets(saved.id, regionIds, tx);
      } else if (data.kind === "company")
        saved = await repository.writeCatalogRecord(
          { kind: "company", data: data.fields },
          data.id,
          tx,
        );
      else if (data.kind === "region")
        saved = await repository.writeCatalogRecord(
          { kind: "region", data: data.fields },
          data.id,
          tx,
        );
      else
        saved = await repository.writeCatalogRecord(
          { kind: "platform", data: data.fields },
          data.id,
          tx,
        );
      if (data.kind !== "region")
        await repository.setCatalogReferences(
          data.kind,
          saved.id,
          data.references.map((r) => ({
            ...r,
            normalizedUrl: r.url ? normalizedWebUrl(r.url) : null,
          })),
          tx,
        );
      const after = await repository.findCatalogRecord(data.kind, saved.id, tx);
      await audit(
        data.kind,
        saved.id,
        saved.revision,
        current.userId,
        before,
        after!,
        tx,
      );
      return saved.id;
    });
  } catch (error) {
    rethrow(error);
  }
}
export async function archiveCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const parsed = catalogArchive.safeParse(input);
      if (!parsed.success) throw new CatalogError("INVALID_INPUT");
      const data = parsed.data;
      await repository.lockCatalogWrites(tx);
      const current = await requirePermission(context, "catalog.manage", tx);
      const before = await repository.findCatalogRecord(data.kind, data.id, tx);
      if (!before) throw new CatalogError("NOT_FOUND");
      if (before.revision !== data.expectedRevision)
        throw new CatalogError("STALE");
      if (Boolean(before.archivedAt) === data.archived) return data.id;
      await repository.archiveCatalogRecord(
        data.kind,
        data.id,
        data.archived,
        tx,
      );
      const after = await repository.findCatalogRecord(data.kind, data.id, tx);
      await audit(
        data.kind,
        data.id,
        after!.revision,
        current.userId,
        before,
        after!,
        tx,
      );
      return data.id;
    });
  } catch (error) {
    rethrow(error);
  }
}
