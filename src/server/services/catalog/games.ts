import "server-only";
import { protectedComponents } from "@/server/repositories/catalog/physical-editions";
import { Prisma } from "@/server/db/generated/client";
import type { PrivateAccessContext } from "@/server/auth/access";
import { PrivateAccessError } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import * as repository from "@/server/repositories/catalog/games";
import * as shared from "@/server/repositories/catalog/management";
import { describeMetadataSource } from "./provenance";
import { CatalogError } from "./management";
import {
  gameSave,
  gameArchive,
  gamePage,
  gameFields,
  releaseFields,
  type GameKind,
} from "@/features/games/validation";
import type { GameCatalogRecord } from "@/features/games/contracts";
import { normalizedWebUrl } from "@/features/catalog/validation";
const fieldLabels: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  description: "Description",
  aliases: "Other names",
  gameId: "Game",
  platformId: "Platform",
  developers: "Developer",
  markets: "Market",
  credits: "Company credit",
  includedItems: "Expected component",
  references: "External reference",
  year: "Year",
  month: "Month",
  day: "Day",
  quantity: "Quantity",
  companyId: "Company",
  regionId: "Market",
  creditLabel: "Credit",
  editionName: "Edition name",
  editionType: "Edition type",
  printingLabel: "Printing label",
  firstReleaseYear: "First release year",
  languages: "Languages",
  descriptionOverride: "Release description",
  identificationStatus: "Identification",
  regionLock: "Region locking",
  regionLockNote: "Region lock notes",
};
type Row = NonNullable<Awaited<ReturnType<typeof repository.findGameCatalog>>>;
const option = (r: {
  id: string;
  name: string;
  archivedAt: Date | null;
  slug?: string;
}) => ({
  id: r.id,
  name: r.name,
  archived: r.archivedAt !== null,
  ...(r.slug ? { detail: r.slug } : {}),
});
function gameCatalogDto(row: Row): GameCatalogRecord {
  const common = {
    id: row.id,
    revision: row.revision,
    archived: row.archivedAt !== null,
    references: row.externalReferences.map((r) => ({
      ...r,
      providerObjectType: r.providerObjectType ?? "",
      externalId: r.externalId ?? "",
      url: r.url ?? "",
    })),
  };
  if ("gameId" in row)
    return {
      ...common,
      kind: "release",
      name: `${row.game.name} · ${row.platform.name} · ${row.editionName ?? row.editionType}`,
      fields: {
        slug: row.slug,
        gameId: row.gameId,
        platformId: row.platformId,
        editionName: row.editionName ?? "",
        editionType: row.editionType,
        printingLabel: row.printingLabel ?? "",
        firstReleaseYear: row.firstReleaseYear?.toString() ?? "",
        languages: row.languages.join("\n"),
        descriptionOverride: row.descriptionOverride ?? "",
        regionLock: row.regionLock ?? "",
        regionLockNote: row.regionLockNote ?? "",
        identificationStatus: row.identificationStatus,
        markets: row.regions.map((m) => ({
          regionId: m.regionId,
          year: m.releaseYear?.toString() ?? "",
          month: m.releaseMonth?.toString() ?? "",
          day: m.releaseDay?.toString() ?? "",
        })),
        credits: row.companies.map((c) => ({
          companyId: c.companyId,
          role: c.role,
          regionId: c.regionId ?? "",
          creditLabel: c.creditLabel ?? "",
        })),
        includedItems: row.includedItems.map((c) => ({
          ...c,
          description: c.description ?? "",
        })),
      },
      options: {
        company: row.companies.map((c) => option(c.company)),
        game: [option(row.game)],
        platform: [option(row.platform)],
        region: row.regions.map((m) => option(m.region)),
      },
    };
  return {
    ...common,
    kind: "game",
    name: row.name,
    fields: {
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      aliases: row.aliases.join("\n"),
      developers: row.companies.map((c) => ({
        companyId: c.companyId,
        creditLabel: c.creditLabel ?? "",
      })),
    },
    options: {
      company: row.companies.map((c) => option(c.company)),
      game: [],
      platform: [],
      region: [],
    },
  };
}
function fail(error: unknown): never {
  if (
    error instanceof CatalogError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003"].includes(error.code)
  )
    throw new CatalogError(
      "INVALID_INPUT",
      "A slug is already used, or a linked record changed. Refresh and review your entries.",
    );
  throw new CatalogError("UNAVAILABLE");
}
async function relation(
  kind: "game" | "company" | "platform" | "region",
  id: string,
  retained: boolean,
  tx: TransactionClient,
) {
  const row =
    kind === "game"
      ? await repository.findGameCatalog("game", id, tx)
      : await shared.findCatalogRecord(kind, id, tx);
  if (!row || (row.archivedAt && !retained))
    throw new CatalogError(
      "INVALID_INPUT",
      "Choose an active linked record. Previously archived links may be retained.",
    );
  return row;
}
function normalized(row: Row) {
  const dto = gameCatalogDto(row);
  return dto.kind === "game"
    ? gameFields.parse(dto.fields)
    : releaseFields.parse(dto.fields);
}
async function audit(
  kind: GameKind,
  id: string,
  revision: number,
  actorId: string,
  before: Row | null,
  after: Row,
  tx: TransactionClient,
) {
  const snapshot = (r: Row) => ({
    ...normalized(r),
    references: r.externalReferences,
    archivedAt: r.archivedAt?.toISOString() ?? null,
  });
  const old = before ? snapshot(before) : {},
    next = snapshot(after);
  const json = (v: unknown) =>
    v == null
      ? Prisma.JsonNull
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
  const changes = Object.entries(next)
    .filter(
      ([k, v]) =>
        JSON.stringify(Reflect.get(old, k) ?? null) !== JSON.stringify(v),
    )
    .map(([fieldPath, after]) => ({
      fieldPath,
      before: json(Reflect.get(old, fieldPath)),
      after: json(after),
    }));
  if (changes.length)
    await shared.appendCatalogHistory(kind, id, revision, actorId, changes, tx);
}
export async function getGameCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "catalog.manage", tx);
        const parsed = gamePage.safeParse(input);
        if (!parsed.success) throw new CatalogError("NOT_FOUND");
        const query = parsed.data;
        const rows = await repository.listGameCatalog(
          query.kind,
          query.page,
          query.archived,
          tx,
        );
        const row = query.id
          ? await repository.findGameCatalog(query.kind, query.id, tx)
          : null;
        if (query.id && !row) throw new CatalogError("NOT_FOUND");
        const history = row
          ? await shared.listCatalogHistory(query.kind, row.id, tx)
          : [];
        return {
          ...query,
          records: rows.slice(0, 25).map((r) => ({
            id: r.id,
            slug: r.slug,
            archived: r.archivedAt !== null,
            name:
              "name" in r
                ? r.name
                : `${r.game.name} · ${r.platform.name} · ${r.editionName ?? r.editionType}`,
          })),
          hasNext: rows.length > 25,
          selected: row ? gameCatalogDto(row) : null,
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
export async function saveGameCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const parsed = gameSave.safeParse(input);
      if (!parsed.success)
        throw new CatalogError(
          "INVALID_INPUT",
          parsed.error.issues
            .slice(0, 4)
            .map((i) => {
              const parts = i.path
                .filter((p) => p !== "fields")
                .map((p) =>
                  typeof p === "number"
                    ? String(p + 1)
                    : (fieldLabels[String(p)] ?? "Details"),
                );
              const message =
                i.code === "unrecognized_keys"
                  ? "Reload the form before trying again."
                  : i.code === "invalid_format" && i.format === "uuid"
                    ? "Choose an existing catalog record."
                    : i.message;
              return `${parts.join(" · ") || "Details"}: ${message}`;
            })
            .join(" "),
        );
      const data = parsed.data;
      await shared.lockCatalogWrites(tx);
      const actor = await requirePermission(context, "catalog.manage", tx);
      const before = data.id
        ? await repository.findGameCatalog(data.kind, data.id, tx)
        : null;
      if (data.id && !before) throw new CatalogError("NOT_FOUND");
      if (before && before.revision !== data.expectedRevision)
        throw new CatalogError("STALE");
      if (before?.archivedAt)
        throw new CatalogError(
          "INVALID_INPUT",
          "Restore this record before editing.",
        );
      const retained = before ? gameCatalogDto(before) : null;
      if (
        data.references.some(
          (r) =>
            r.id && !before?.externalReferences.some((old) => old.id === r.id),
        )
      )
        throw new CatalogError(
          "INVALID_INPUT",
          "An external reference belongs to another record.",
        );
      let saved: { id: string; revision: number };
      if (data.kind === "game") {
        for (const c of data.fields.developers)
          await relation(
            "company",
            c.companyId,
            (retained?.kind === "game" &&
              retained.fields.developers.some(
                (d) => d.companyId === c.companyId,
              )) ||
              false,
            tx,
          );
        const { developers, ...fields } = data.fields;
        saved = await repository.saveGame(fields, data.id, tx);
        await repository.setDevelopers(saved.id, developers, tx);
      } else {
        const f = data.fields,
          old = retained?.kind === "release" ? retained.fields : null;
        if (
          data.id &&
          (await protectedComponents(data.id, tx)).some(
            (c) =>
              !f.includedItems.some(
                (next) => next.id === c.id && next.kind === c.kind,
              ),
          )
        )
          throw new CatalogError(
            "INVALID_INPUT",
            "Detach the physical template and artwork before removing this component or changing its kind.",
          );
        await relation("game", f.gameId, old?.gameId === f.gameId, tx);
        await relation(
          "platform",
          f.platformId,
          old?.platformId === f.platformId,
          tx,
        );
        const markets = [];
        for (const m of f.markets)
          markets.push(
            await relation(
              "region",
              m.regionId,
              old?.markets.some((r) => r.regionId === m.regionId) || false,
              tx,
            ),
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
        for (const c of f.credits)
          await relation(
            "company",
            c.companyId,
            old?.credits.some(
              (o) =>
                o.companyId === c.companyId &&
                o.role === c.role &&
                o.regionId === (c.regionId ?? ""),
            ) || false,
            tx,
          );
        if (
          f.includedItems.some(
            (c) => c.id && !old?.includedItems.some((o) => o.id === c.id),
          )
        )
          throw new CatalogError(
            "INVALID_INPUT",
            "A component does not belong to this release.",
          );
        const {
          markets: ignoredMarkets,
          credits: ignoredCredits,
          includedItems: ignoredItems,
          ...fields
        } = f;
        void ignoredMarkets;
        void ignoredCredits;
        void ignoredItems;
        saved = await repository.saveRelease(fields, data.id, tx);
        await repository.setReleaseDetails(saved.id, f, tx);
      }
      await shared.setCatalogReferences(
        data.kind,
        saved.id,
        data.references.map((r) => ({
          ...r,
          normalizedUrl: r.url ? normalizedWebUrl(r.url) : null,
        })),
        tx,
      );
      const after = (await repository.findGameCatalog(
        data.kind,
        saved.id,
        tx,
      ))!;
      await audit(
        data.kind,
        saved.id,
        saved.revision,
        actor.userId,
        before,
        after,
        tx,
      );
      return saved.id;
    });
  } catch (e) {
    fail(e);
  }
}
export async function archiveGameCatalog(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const p = gameArchive.safeParse(input);
      if (!p.success) throw new CatalogError("INVALID_INPUT");
      const d = p.data;
      await shared.lockCatalogWrites(tx);
      const actor = await requirePermission(context, "catalog.manage", tx);
      const before = await repository.findGameCatalog(d.kind, d.id, tx);
      if (!before) throw new CatalogError("NOT_FOUND");
      if (before.revision !== d.expectedRevision)
        throw new CatalogError("STALE");
      if (Boolean(before.archivedAt) === d.archived) return d.id;
      await repository.archiveGameCatalog(d.kind, d.id, d.archived, tx);
      const after = (await repository.findGameCatalog(d.kind, d.id, tx))!;
      await audit(
        d.kind,
        d.id,
        after.revision,
        actor.userId,
        before,
        after,
        tx,
      );
      return d.id;
    });
  } catch (e) {
    fail(e);
  }
}
