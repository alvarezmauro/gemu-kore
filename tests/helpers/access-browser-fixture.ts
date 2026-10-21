import {
  seedSearchData,
  resetSearchData,
  seedFilterData,
  seedBrowseData,
} from "./search-data";
import { randomUUID } from "node:crypto";
import { disconnectDatabase, getDatabase } from "../../src/server/db/client";

async function main() {
  if (
    !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
    process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
  ) {
    throw new Error(
      "Access browser fixtures require the isolated test runner.",
    );
  }
  const [command, argument] = process.argv.slice(2);
  const database = getDatabase();
  try {
    let result: unknown = null;
    if (command === "seed-accessory-catalog") {
      const company = await database.company.create({
        data: { name: "Sony", slug: "sony" },
      });
      const first = await database.consolePlatform.create({
        data: { name: "PlayStation", slug: "playstation" },
      });
      const second = await database.consolePlatform.create({
        data: { name: "PlayStation 2", slug: "playstation-2" },
      });
      const region = await database.region.create({
        data: { name: "North America", code: "NA", slug: "north-america" },
      });
      result = {
        companyId: company.id,
        platformIds: [first.id, second.id],
        regionId: region.id,
      };
    } else if (command === "accessory-catalog-state") {
      result = {
        families: await database.accessory.findMany({
          select: { id: true, name: true, revision: true, archivedAt: true },
        }),
        variants: await database.accessoryVariant.findMany({
          select: {
            id: true,
            name: true,
            slug: true,
            revision: true,
            archivedAt: true,
            platforms: {
              select: { platformId: true, compatibilityNote: true },
            },
          },
        }),
        ownedCount: await database.ownedAccessory.count(),
      };
    } else if (command === "seed-game-detail") {
      const { seedGameDetail } = await import("./game-detail-fixture");
      result = await seedGameDetail(database, JSON.parse(argument!));
    } else if (command === "remove-detail-covers") {
      const { gameId, releaseId, scope } = JSON.parse(argument!);
      await database.catalogAsset.deleteMany({
        where: {
          role: "COVER",
          OR: [
            { gameReleaseId: releaseId },
            ...(scope === "all" ? [{ gameId }] : []),
          ],
        },
      });
    } else if (command === "seed-cartridge-components") {
      await database.gameReleaseIncludedItem.createMany({
        data: [
          {
            gameReleaseId: argument!,
            name: "Cartridge",
            kind: "MEDIA",
            sortOrder: 1,
          },
          {
            gameReleaseId: argument!,
            name: "Second cartridge",
            kind: "MEDIA",
            sortOrder: 2,
          },
          {
            gameReleaseId: argument!,
            name: "Box",
            kind: "PACKAGING",
            sortOrder: 3,
          },
        ],
      });
      result = { releaseId: argument };
    } else if (command === "media-state") {
      result = {
        uses: await database.catalogAsset.findMany({
          where: { role: "GALLERY" },
          select: { assetId: true },
        }),
        templates: await database.physicalMediaTemplate.findMany({
          include: { slots: true },
        }),
        bindings: await database.physicalMediaTextureBinding.findMany(),
        copies: await database.collectionItem.findMany({
          select: { id: true, hasBox: true },
        }),
      };
    } else if (command === "seed-packaging-components") {
      const releaseId = argument!;
      await database.gameReleaseIncludedItem.createMany({
        data: [
          {
            gameReleaseId: releaseId,
            name: "Outer box",
            kind: "PACKAGING",
            sortOrder: 1,
          },
          {
            gameReleaseId: releaseId,
            name: "Inner box",
            kind: "PACKAGING",
            sortOrder: 2,
          },
        ],
      });
      result = { releaseId };
    } else if (command === "packaging-state") {
      result = {
        uses: await database.catalogAsset.findMany({
          where: { role: "GALLERY" },
          select: { assetId: true },
        }),
        templates: await database.packagingTemplate.findMany({
          include: { slots: true },
        }),
        bindings: await database.packagingTextureBinding.findMany(),
        assets: await database.asset.findMany({
          select: {
            id: true,
            sourceType: true,
            licenseName: true,
            deliveryClass: true,
          },
        }),
        copies: await database.collectionItem.findMany({
          select: { id: true, hasBox: true },
        }),
      };
    } else if (command === "seed-enrichment") {
      const { token, gameId, prepare, apply, limited } = JSON.parse(argument!);
      const { signedSessionCookie } = await import("./access-session");
      const { requirePrivateAccess } =
        await import("../../src/server/auth/access");
      const {
        createEnrichmentRunner,
        prepareEnrichmentReview,
        applyEnrichmentSuggestions,
      } = await import("../../src/server/services/enrichment");
      const { mapGame, mapSearch } =
        await import("../../src/server/providers/game-metadata/igdb-mapping");
      const { default: raw } =
        await import("../fixtures/game-metadata/igdb-game.json");
      const when = "2026-10-19T12:00:00.000Z";
      const evidenceInput = limited
        ? { ...raw, videos: [...raw.videos, null] }
        : raw;
      const cookie = signedSessionCookie(
        token,
        process.env.BETTER_AUTH_SECRET!,
      );
      const actor = await requirePrivateAccess(
        new Headers({
          Cookie: `__Secure-gemukore.session_token=${cookie}; gemukore.session_token=${cookie}`,
        }),
      );
      const runner = createEnrichmentRunner(() => ({
        id: "IGDB",
        search: async () => ({ ok: true, data: mapSearch([raw], when, null) }),
        fetch: async () => ({
          ok: true,
          data: mapGame(evidenceInput, [], when),
        }),
      }));
      const game = await database.game.findUniqueOrThrow({
        where: { id: gameId },
      });
      const found = await runner.start(actor, {
        target: { kind: "game", id: gameId },
        expectedRevision: game.revision,
        requestKey: randomUUID(),
        query: "Orbit Quest",
      });
      const fetched = await runner.selectCandidate(actor, {
        runId: found.id,
        expectedRunVersion: found.runVersion,
        externalId: "42",
      });
      const review =
        prepare || apply
          ? await prepareEnrichmentReview(actor, {
              runId: fetched.id,
              expectedRunVersion: fetched.runVersion,
              fields: ["name", "description", "references"],
            })
          : fetched;
      result = review;
      if (apply)
        await applyEnrichmentSuggestions(actor, {
          runId: review.id,
          reviewToken: review.reviewToken,
          suggestionIds: review.suggestions.map((s) => s.id),
          manualReplacementIds: review.suggestions
            .filter((s) => s.manualReplacementRequired)
            .map((s) => s.id),
        });
    } else if (command === "seed-provenance-copy") {
      const { token, releaseId } = JSON.parse(argument!);
      const { signedSessionCookie } = await import("./access-session");
      const { requirePrivateAccess } =
        await import("../../src/server/auth/access");
      const { createGameCopy } =
        await import("../../src/server/services/collection/games");
      const { emptyCopyPhysical } =
        await import("../../src/features/collection/copy-validation");
      const cookie = signedSessionCookie(
        token,
        process.env.BETTER_AUTH_SECRET!,
      );
      const actor = await requirePrivateAccess(
        new Headers({
          Cookie: `__Secure-gemukore.session_token=${cookie}; gemukore.session_token=${cookie}`,
        }),
      );
      const release = await database.gameRelease.findUniqueOrThrow({
        where: { id: releaseId },
        include: { game: true, platform: true },
      });
      result = {
        id: await createGameCopy(actor, {
          ...emptyCopyPhysical,
          id: randomUUID(),
          gameId: release.gameId,
          gameRevision: release.game.revision,
          releaseId: release.id,
          releaseRevision: release.revision,
          platformId: release.platformId,
          platformRevision: release.platform.revision,
        }),
      };
    } else if (command === "enrichment-state") {
      result = {
        runs: await database.enrichmentRun.count(),
        changes: await database.metadataChange.findMany({
          select: {
            origin: true,
            fieldPath: true,
            enrichmentSuggestionId: true,
          },
        }),
        suggestions: await database.enrichmentSuggestion.findMany({
          select: { reviewStatus: true, fieldPath: true },
        }),
      };
    } else if (command === "reset-game-creation") {
      await database.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, game, accessory CASCADE`;
    } else if (command === "reset-catalog") {
      await database.$executeRaw`TRUNCATE TABLE company, region, console_platform, game, accessory CASCADE`;
    } else if (command === "seed-game-creation") {
      const platform = await database.consolePlatform.create({
        data: { name: "SNES", slug: "snes" },
      });
      const game = await database.game.create({
        data: {
          name: "Chrono Trigger",
          slug: "chrono-trigger",
          aliases: ["クロノ"],
        },
      });
      const region = await database.region.create({
        data: { name: "North America", code: "NA", slug: "north-america" },
      });
      const release = await database.gameRelease.create({
        data: {
          gameId: game.id,
          platformId: platform.id,
          slug: "chrono-snes-na",
          editionName: "Standard Edition",
          regions: {
            create: { regionId: region.id, releaseYear: 1995, releaseMonth: 8 },
          },
          includedItems: {
            create: { name: "Manual", kind: "MANUAL", quantity: 1 },
          },
        },
      });
      await database.gameRelease.create({
        data: {
          gameId: game.id,
          platformId: platform.id,
          slug: "chrono-snes-unknown",
          editionName: "Deluxe Edition",
          editionType: "DELUXE",
        },
      });
      const location = await database.location.create({
        data: { name: "Game shelf", normalizedName: "game shelf" },
      });
      result = {
        platformId: platform.id,
        gameId: game.id,
        releaseId: release.id,
        regionId: region.id,
        locationId: location.id,
      };
    } else if (command === "revise-game-release") {
      await database.gameRelease.update({
        where: { id: argument! },
        data: { revision: { increment: 1 } },
      });
    } else if (command === "game-creation-state") {
      result = await database.collectionItem.findMany({
        where: { type: "GAME" },
        select: {
          id: true,
          publicationStatus: true,
          serialNumber: true,
          notes: true,
          hasBox: true,
          locationId: true,
          ownedGame: { select: { gameReleaseId: true } },
          defects: { select: { title: true, severity: true } },
          media: { select: { id: true, publicApproved: true, type: true } },
        },
      });
    } else if (command === "seed-game-catalog") {
      const platform = await database.consolePlatform.create({
        data: { name: "SNES", slug: "snes" },
      });
      const company = await database.company.create({
        data: { name: "Square", slug: "square" },
      });
      const region = await database.region.create({
        data: { name: "North America", code: "NA", slug: "north-america" },
      });
      result = {
        platformId: platform.id,
        companyId: company.id,
        regionId: region.id,
      };
    } else if (command === "game-catalog-state") {
      result = {
        games: await database.game.findMany({
          select: {
            id: true,
            name: true,
            revision: true,
            archivedAt: true,
            companies: { select: { companyId: true } },
          },
        }),
        releases: await database.gameRelease.findMany({
          select: {
            id: true,
            gameId: true,
            platformId: true,
            editionName: true,
            revision: true,
            regions: {
              select: {
                regionId: true,
                releaseYear: true,
                releaseMonth: true,
                releaseDay: true,
              },
            },
            companies: {
              select: { companyId: true, role: true, regionId: true },
            },
            includedItems: {
              select: { id: true, name: true, kind: true, quantity: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        }),
        copies: await database.collectionItem.count(),
      };
    } else if (command === "catalog-state") {
      result = {
        companies: await database.company.count(),
        models: await database.consoleModel.findMany({
          select: {
            name: true,
            platformId: true,
            manufacturerId: true,
            revision: true,
            archivedAt: true,
            regionLock: true,
            specifications: true,
            regions: { select: { regionId: true } },
            externalReferences: {
              select: { provider: true, externalId: true, normalizedUrl: true },
            },
          },
        }),
        copies: await database.collectionItem.count(),
        history: await database.metadataChange.count(),
      };
    } else if (command === "seed-console-creation") {
      const company = await database.company.create({
        data: { name: "Sony", slug: randomUUID() },
      });
      const platform = await database.consolePlatform.create({
        data: {
          name: "PlayStation",
          aliases: ["PSX"],
          slug: randomUUID(),
          manufacturerId: company.id,
          originalReleaseYear: 1994,
          generation: 5,
        },
      });
      const model = await database.consoleModel.create({
        data: {
          name: "SCPH-1000",
          modelNumber: "SCPH-1000",
          slug: randomUUID(),
          platformId: platform.id,
          releaseYear: 1994,
        },
      });
      await database.consoleModel.create({
        data: { name: "PS one", slug: randomUUID(), platformId: platform.id },
      });
      const solo = await database.consolePlatform.create({
        data: { name: "Nintendo Entertainment System", slug: randomUUID() },
      });
      await database.consoleModel.create({
        data: { name: "NES-001", slug: randomUUID(), platformId: solo.id },
      });
      await database.consolePlatform.create({
        data: { name: "No hardware yet", slug: randomUUID() },
      });
      const region = await database.region.create({
        data: { name: "Japan", code: "JP", slug: randomUUID() },
      });
      await database.consoleModelRegion.create({
        data: { consoleModelId: model.id, regionId: region.id },
      });
      const home = await database.location.create({
        data: { name: "Home", normalizedName: "home", type: "PROPERTY" },
      });
      const shelf = await database.location.create({
        data: {
          name: "Shelf",
          normalizedName: "shelf",
          parentId: home.id,
          type: "SHELF",
        },
      });
      result = {
        platformId: platform.id,
        modelId: model.id,
        shelfId: shelf.id,
      };
    } else if (command === "seed-console-copies") {
      const modelId = argument;
      const copies = [];
      for (const serialNumber of ["COPY-ONE", "COPY-TWO"]) {
        copies.push(
          await database.collectionItem.create({
            data: {
              type: "CONSOLE",
              serialNumber,
              notes: "Childhood copy",
              hasBox: true,
              ownedConsole: { create: { consoleModelId: modelId } },
              defects: { create: { title: "Yellowing", severity: "COSMETIC" } },
            },
            select: { id: true },
          }),
        );
      }
      result = { id: copies[0].id, siblingId: copies[1].id };
    } else if (command === "console-creation-state") {
      result = await database.collectionItem.findMany({
        select: {
          id: true,
          serialNumber: true,
          revision: true,
          notes: true,
          observedMarkings: true,
          hasBox: true,
          locationId: true,
          publicationStatus: true,
          ownedConsole: { select: { consoleModelId: true } },
          defects: { select: { title: true, severity: true } },
          media: {
            select: {
              id: true,
              type: true,
              isPrimary: true,
              publicApproved: true,
              asset: { select: { kind: true, state: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    } else if (command === "change-console-model") {
      await database.consoleModel.update({
        where: { id: argument },
        data: { revision: { increment: 1 }, name: "Revised SCPH-1000" },
      });
    } else if (command === "seed-catalog-pages") {
      await database.company.createMany({
        data: Array.from({ length: 27 }, (_, i) => ({
          name: `Company ${String(i).padStart(2, "0")}`,
          slug: `company-${i}`,
        })),
      });
    } else if (command === "reset-search") {
      await resetSearchData(database);
    } else if (command === "seed-collection") {
      result = await seedBrowseData(database);
    } else if (command === "seed-filters") {
      result = await seedFilterData(database);
    } else if (command === "seed-search") {
      result = await seedSearchData(database);
    } else if (command === "rename-filter-platform") {
      const input = JSON.parse(argument) as { id: string; name: string };
      await database.consolePlatform.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    } else if (command === "rename-search-game") {
      const input = JSON.parse(argument) as { id: string; name: string };
      await database.game.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    } else if (command === "reset-media") {
      await database.$executeRaw`TRUNCATE TABLE asset, collection_item, console_platform, game, accessory CASCADE`;
    } else if (command === "media-records") {
      result = await database.collectionItemMedia.findMany({
        where: argument ? { collectionItemId: argument } : {},
        select: {
          id: true,
          assetId: true,
          type: true,
          caption: true,
          sortOrder: true,
          publicApproved: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
    } else if (command === "asset-count") {
      result = await database.asset.count();
    } else if (command === "reset-defects") {
      await database.$executeRaw`TRUNCATE TABLE collection_item, console_platform, game, accessory CASCADE`;
    } else if (command === "seed-defect-items") {
      const platform = await database.consolePlatform.create({
        data: { name: "SNES", slug: randomUUID() },
      });
      const game = await database.game.create({
        data: { name: "Chrono Trigger", slug: randomUUID() },
      });
      const release = await database.gameRelease.create({
        data: {
          slug: randomUUID(),
          gameId: game.id,
          platformId: platform.id,
          editionName: "Original",
        },
      });
      const first = await database.collectionItem.create({
        data: {
          type: "GAME",
          ownedGame: { create: { gameReleaseId: release.id } },
        },
      });
      const second = await database.collectionItem.create({
        data: {
          type: "GAME",
          ownedGame: { create: { gameReleaseId: release.id } },
        },
      });
      const model = await database.consoleModel.create({
        data: {
          name: "Super Nintendo",
          slug: randomUUID(),
          platformId: platform.id,
        },
      });
      const consoleCopy = await database.collectionItem.create({
        data: {
          type: "CONSOLE",
          ownedConsole: { create: { consoleModelId: model.id } },
        },
      });
      result = {
        firstId: first.id,
        secondId: second.id,
        consoleId: consoleCopy.id,
      };
    } else if (command === "defect-count") {
      result = await database.defect.count();
    } else if (command === "reset-locations") {
      await database.$executeRaw`TRUNCATE TABLE location CASCADE`;
    } else if (command === "seed-locations") {
      const home = await database.location.create({
        data: { name: "Home", normalizedName: "home", type: "PROPERTY" },
      });
      await database.location.create({
        data: {
          name: "Other",
          normalizedName: "other",
          type: "PROPERTY",
          sortOrder: 1,
        },
      });
      const office = await database.location.create({
        data: {
          name: "Office",
          normalizedName: "office",
          parentId: home.id,
          type: "ROOM",
        },
      });
      const cabinet = await database.location.create({
        data: {
          name: "Retro Cabinet",
          normalizedName: "retro cabinet",
          parentId: office.id,
          type: "FURNITURE",
        },
      });
      await database.location.create({
        data: {
          name: "Shelf 2",
          normalizedName: "shelf 2",
          parentId: cabinet.id,
          type: "SHELF",
        },
      });
    } else if (command === "location-count") {
      result = await database.location.count();
    } else if (command === "reset") {
      await database.accessGrant.deleteMany();
      await database.user.deleteMany();
    } else if (command === "sign-in") {
      const options = JSON.parse(argument ?? "{}") as {
        email?: string;
        role?: "ADMIN" | "EDITOR" | "VIEWER";
        enabled?: boolean;
        verified?: boolean;
      };
      const email = options.email ?? "browser-identity@example.com";
      const user = await database.user.create({
        data: {
          name: "Browser fixture",
          email,
          emailVerified: options.verified ?? true,
        },
      });
      const token = randomUUID();
      await database.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      if (options.role)
        await database.accessGrant.create({
          data: {
            email,
            role: options.role,
            enabled: options.enabled ?? true,
          },
        });
      result = { email, token };
    } else if (command === "update") {
      await database.accessGrant.update({
        where: { email: "browser-identity@example.com" },
        data: JSON.parse(argument),
      });
    } else if (command === "delete") {
      await database.accessGrant.delete({
        where: { email: "browser-identity@example.com" },
      });
    } else if (command === "sessions") {
      result = await database.session.count();
    } else if (command === "expire") {
      await database.session.updateMany({
        where: { user: { email: argument } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    } else if (command === "revoke") {
      await database.session.deleteMany({
        where: { user: { email: argument } },
      });
    } else throw new Error("Unknown access browser fixture command.");
    console.info(JSON.stringify(result));
  } finally {
    await disconnectDatabase();
  }
}

void main().catch((error: unknown) => {
  console.error("Access browser fixture failed.");
  // Bounded diagnostic identity only: never echo credentials, commands or database errors.
  if (error instanceof Error)
    console.error(
      error.name,
      "code" in error && typeof error.code === "string"
        ? error.code
        : "NO_CODE",
    );
  process.exitCode = 1;
});
