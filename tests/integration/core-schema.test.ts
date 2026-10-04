import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import { Prisma, type CollectionItemType } from "@/server/db/generated/client";

const db = getDatabase();
const run = promisify(execFile);
const slug = () => randomUUID();
let platformId: string;
let modelId: string;
let gameId: string;
let releaseId: string;
let accessoryId: string;
let variantId: string;
let companyId: string;
let regionId: string;

beforeEach(async () => {
  companyId = (
    await db.company.create({ data: { name: "Maker", slug: slug() } })
  ).id;
  regionId = (
    await db.region.create({
      data: { name: "Japan", code: "JP", slug: slug() },
    })
  ).id;
  platformId = (
    await db.consolePlatform.create({
      data: { name: "Platform", slug: slug(), manufacturerId: companyId },
    })
  ).id;
  modelId = (
    await db.consoleModel.create({
      data: { name: "Model", slug: slug(), platformId },
    })
  ).id;
  gameId = (await db.game.create({ data: { name: "Game", slug: slug() } })).id;
  releaseId = (
    await db.gameRelease.create({ data: { slug: slug(), gameId, platformId } })
  ).id;
  accessoryId = (
    await db.accessory.create({ data: { name: "Controller", slug: slug() } })
  ).id;
  variantId = (
    await db.accessoryVariant.create({
      data: { name: "Black", slug: slug(), accessoryId },
    })
  ).id;
});

afterEach(async () => {
  // Isolated runner database only. History is immutable to ordinary DELETE;
  // fixture reset is not an application operation or production cleanup API.
  await db.$executeRaw`TRUNCATE TABLE company, region, console_platform, console_model, game, game_release, accessory, accessory_variant, collection_item, location CASCADE`;
});
afterAll(disconnectDatabase);

async function item(type: CollectionItemType = "GAME") {
  return withTransaction(async (tx) => {
    const root = await tx.collectionItem.create({ data: { type } });
    if (type === "CONSOLE")
      await tx.ownedConsole.create({
        data: { collectionItemId: root.id, consoleModelId: modelId },
      });
    if (type === "GAME")
      await tx.ownedGame.create({
        data: { collectionItemId: root.id, gameReleaseId: releaseId },
      });
    if (type === "ACCESSORY")
      await tx.ownedAccessory.create({
        data: { collectionItemId: root.id, accessoryVariantId: variantId },
      });
    return root;
  });
}

it("deploys migrations idempotently and has no Prisma-visible schema drift", async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
  const deployed = await run("pnpm", ["db:deploy"], { env, timeout: 60_000 });
  expect(deployed.stdout).toContain("No pending migrations");
  const diff = await run(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { env, timeout: 60_000 },
  ).catch((error: unknown) => {
    // This command prints schema differences, never database row values.
    throw new Error(
      String((error as { stdout?: string }).stdout ?? "Schema diff failed."),
    );
  });
  expect(diff.stdout).toContain("No difference detected");
}, 60_000);

it("starts with single settings rows and every public visibility gate disabled", async () => {
  expect(await db.appSettings.findMany()).toMatchObject([
    { id: 1, revision: 1, timezone: "UTC", defaultTheme: "SYSTEM" },
  ]);
  expect(await db.publicSettings.findMany()).toEqual([
    expect.objectContaining({
      id: 1,
      publicCollectionEnabled: false,
      allowSearchEngineIndexing: false,
      showSerialNumbers: false,
      showLocations: false,
      showNotes: false,
      showDefects: false,
      showPersonalPhotos: false,
    }),
  ]);
  await expect(db.appSettings.create({ data: { id: 2 } })).rejects.toThrow();
  await expect(db.publicSettings.create({ data: { id: 2 } })).rejects.toThrow();
  await expect(db.appSettings.delete({ where: { id: 1 } })).rejects.toThrow();
  await expect(
    db.publicSettings.delete({ where: { id: 1 } }),
  ).rejects.toThrow();
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "atomically creates a matching %s aggregate with private unknown-copy defaults",
  async (type) => {
    const root = await item(type);
    expect(root).toMatchObject({
      type,
      revision: 1,
      hasBox: null,
      locationId: null,
      publicationStatus: "PRIVATE",
      publishedAt: null,
      publishedById: null,
    });
    const saved = await db.collectionItem.findUniqueOrThrow({
      where: { id: root.id },
      include: { ownedConsole: true, ownedGame: true, ownedAccessory: true },
    });
    expect(
      [saved.ownedConsole, saved.ownedGame, saved.ownedAccessory].filter(
        Boolean,
      ),
    ).toHaveLength(1);
  },
);

it("supports Prisma nested aggregate creation with the composite relation", async () => {
  const root = await db.collectionItem.create({
    data: {
      type: "GAME",
      ownedGame: { create: { gameRelease: { connect: { id: releaseId } } } },
    },
    include: { ownedGame: true },
  });
  expect(root.ownedGame?.collectionItemId).toBe(root.id);
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "rejects an orphan %s root at transaction commit, including direct SQL",
  async (type) => {
    await expect(
      withTransaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO collection_item (type) VALUES (${type}::"CollectionItemType")`;
      }),
    ).rejects.toThrow();
    expect(await db.collectionItem.count()).toBe(0);
  },
);

it("rejects a mismatched subtype and a forged fixed child type", async () => {
  await expect(
    withTransaction(async (tx) => {
      const root = await tx.collectionItem.create({
        data: { type: "CONSOLE" },
      });
      await tx.ownedGame.create({
        data: { collectionItemId: root.id, gameReleaseId: releaseId },
      });
    }),
  ).rejects.toThrow();
  await expect(
    withTransaction(async (tx) => {
      const root = await tx.collectionItem.create({
        data: { type: "CONSOLE" },
      });
      await tx.$executeRaw`INSERT INTO owned_game ("collectionItemId", type, "gameReleaseId") VALUES (${root.id}::uuid, 'CONSOLE', ${releaseId}::uuid)`;
    }),
  ).rejects.toThrow();
  expect(await db.collectionItem.count()).toBe(0);
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "rejects changing a new %s root ID before its deferred check",
  async (type) => {
    await expect(
      withTransaction(async (tx) => {
        const root = await tx.collectionItem.create({ data: { type } });
        await tx.$executeRaw`UPDATE collection_item SET id = ${randomUUID()}::uuid WHERE id = ${root.id}::uuid`;
      }),
    ).rejects.toThrow();
    expect(await db.collectionItem.count()).toBe(0);
  },
);

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "rejects deleting a %s child then changing its root ID to bypass the deferred check",
  async (type) => {
    const root = await item(type);
    await expect(
      withTransaction(async (tx) => {
        if (type === "CONSOLE")
          await tx.ownedConsole.delete({
            where: { collectionItemId: root.id },
          });
        if (type === "GAME")
          await tx.ownedGame.delete({ where: { collectionItemId: root.id } });
        if (type === "ACCESSORY")
          await tx.ownedAccessory.delete({
            where: { collectionItemId: root.id },
          });
        await tx.collectionItem.update({
          where: { id: root.id },
          data: { id: randomUUID() },
        });
      }),
    ).rejects.toThrow();
    const saved = await db.collectionItem.findUniqueOrThrow({
      where: { id: root.id },
      include: { ownedConsole: true, ownedGame: true, ownedAccessory: true },
    });
    expect(
      [saved.ownedConsole, saved.ownedGame, saved.ownedAccessory].filter(
        Boolean,
      ),
    ).toHaveLength(1);
  },
);

const scalarLists = [
  ["company", "aliases"],
  ["console_platform", "aliases"],
  ["game", "aliases"],
  ["game_release", "languages"],
] as const;

it.each(scalarLists)(
  "enforces a required flat string list for %s.%s",
  async (table, column) => {
    const id = {
      company: companyId,
      console_platform: platformId,
      game: gameId,
      game_release: releaseId,
    }[table];
    // These identifiers are fixed test constants, never request input.
    const target = Prisma.raw(table);
    const field = Prisma.raw(column);
    for (const invalid of [
      Prisma.sql`NULL`,
      Prisma.sql`ARRAY['known', NULL]::text[]`,
      Prisma.sql`ARRAY[['one'], ['two']]::text[]`,
    ]) {
      await expect(
        db.$executeRaw(
          Prisma.sql`UPDATE ${target} SET ${field} = ${invalid} WHERE id = ${id}::uuid`,
        ),
      ).rejects.toThrow();
    }
    await db.$executeRaw(
      Prisma.sql`UPDATE ${target} SET ${field} = ARRAY['known']::text[] WHERE id = ${id}::uuid`,
    );
    const rows = await db.$queryRaw<{ values: string[] }[]>(
      Prisma.sql`SELECT ${field} AS values FROM ${target} WHERE id = ${id}::uuid`,
    );
    expect(rows[0].values).toEqual(["known"]);
    await db.$executeRaw(
      Prisma.sql`UPDATE ${target} SET ${field} = ARRAY[]::text[] WHERE id = ${id}::uuid`,
    );
  },
);

it("covers every foreign key with a valid full index having its columns as a leading prefix", async () => {
  const missing = await db.$queryRaw<{ name: string }[]>`
    SELECT c.conname AS name
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_index i
        WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL
          AND ARRAY(
            SELECT key FROM unnest(i.indkey) WITH ORDINALITY AS k(key, position)
            WHERE position <= cardinality(c.conkey) ORDER BY position
          ) = c.conkey
      )
    ORDER BY c.conname`;
  expect(missing).toEqual([]);
});

it("indexes each canonical history target for deterministic chronological reads", async () => {
  const indexes = await db.$queryRaw<{ columns: string[] }[]>`
    SELECT ARRAY(
      SELECT a.attname::text
      FROM unnest(i.indkey) WITH ORDINALITY AS k(key, position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.key
      ORDER BY position
    ) AS columns
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = 'public.metadata_change'::regclass
      AND i.indisvalid AND i.indisready AND i.indpred IS NULL`;
  for (const target of [
    "companyId",
    "regionId",
    "platformId",
    "consoleModelId",
    "gameId",
    "gameReleaseId",
    "accessoryId",
    "accessoryVariantId",
  ])
    expect(indexes).toContainEqual({ columns: [target, "createdAt", "id"] });
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "rejects deletion of the sole %s subtype while its root survives",
  async (type) => {
    const root = await item(type);
    await expect(
      withTransaction(async (tx) => {
        if (type === "CONSOLE")
          await tx.ownedConsole.delete({
            where: { collectionItemId: root.id },
          });
        if (type === "GAME")
          await tx.ownedGame.delete({ where: { collectionItemId: root.id } });
        if (type === "ACCESSORY")
          await tx.ownedAccessory.delete({
            where: { collectionItemId: root.id },
          });
      }),
    ).rejects.toThrow();
    expect(await db.collectionItem.count()).toBe(1);
  },
);

it("checks both old and new root when a subtype is moved", async () => {
  const root = await item();
  await expect(
    withTransaction(async (tx) => {
      const next = await tx.collectionItem.create({ data: { type: "GAME" } });
      await tx.ownedGame.update({
        where: { collectionItemId: root.id },
        data: { collectionItemId: next.id },
      });
    }),
  ).rejects.toThrow();
  expect(
    await db.ownedGame.findUnique({ where: { collectionItemId: root.id } }),
  ).not.toBeNull();
});

it("allows same-type subtype replacement within one transaction but prohibits category changes", async () => {
  const root = await item();
  await withTransaction(async (tx) => {
    await tx.ownedGame.delete({ where: { collectionItemId: root.id } });
    await tx.ownedGame.create({
      data: { collectionItemId: root.id, gameReleaseId: releaseId },
    });
  });
  await expect(
    db.collectionItem.update({
      where: { id: root.id },
      data: { type: "CONSOLE" },
    }),
  ).rejects.toThrow();
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "deletes a %s copy and its defects without deleting shared catalog identity",
  async (type) => {
    const root = await item(type);
    await db.defect.create({
      data: {
        collectionItemId: root.id,
        title: "Scratch",
        severity: "COSMETIC",
      },
    });
    await db.collectionItem.delete({ where: { id: root.id } });
    expect(await db.defect.count()).toBe(0);
    expect(
      (await db.ownedConsole.count()) +
        (await db.ownedGame.count()) +
        (await db.ownedAccessory.count()),
    ).toBe(0);
    expect(await db.consoleModel.count()).toBe(1);
    expect(await db.gameRelease.count()).toBe(1);
    expect(await db.accessoryVariant.count()).toBe(1);
  },
);

it("keeps multiple physical printings and copies independent even with identical labels/codes/serials", async () => {
  const other = await db.gameRelease.create({
    data: { slug: slug(), gameId, platformId, editionType: "STANDARD" },
  });
  for (const id of [releaseId, other.id])
    await db.productIdentifier.create({
      data: {
        gameReleaseId: id,
        scheme: "UPC",
        value: "001234",
        normalizedValue: "001234",
      },
    });
  const first = await item();
  const second = await item();
  await db.collectionItem.updateMany({
    data: { serialNumber: "same-marking" },
  });
  await db.collectionItem.update({
    where: { id: first.id },
    data: { notes: "First copy", hasBox: true },
  });
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: second.id } }))
      .notes,
  ).toBeNull();
  expect(await db.gameRelease.count()).toBe(2);
});

it("restricts catalog roots, companies and markets while referenced", async () => {
  await item("CONSOLE");
  await item("GAME");
  await item("ACCESSORY");
  await db.consoleModelRegion.create({
    data: { consoleModelId: modelId, regionId },
  });
  await expect(
    db.consoleModel.delete({ where: { id: modelId } }),
  ).rejects.toThrow();
  await expect(
    db.gameRelease.delete({ where: { id: releaseId } }),
  ).rejects.toThrow();
  await expect(
    db.accessoryVariant.delete({ where: { id: variantId } }),
  ).rejects.toThrow();
  await expect(
    db.consolePlatform.delete({ where: { id: platformId } }),
  ).rejects.toThrow();
  await expect(
    db.company.delete({ where: { id: companyId } }),
  ).rejects.toThrow();
  await expect(db.region.delete({ where: { id: regionId } })).rejects.toThrow();
  await expect(
    db.region.update({ where: { id: regionId }, data: { code: "NA" } }),
  ).rejects.toThrow();
});

it("models multiple markets independently of locking and variant compatibility", async () => {
  const otherRegion = await db.region.create({
    data: { name: "Europe", code: "EU", slug: slug() },
  });
  await db.consoleModelRegion.createMany({
    data: [
      { consoleModelId: modelId, regionId },
      { consoleModelId: modelId, regionId: otherRegion.id },
    ],
  });
  await db.consoleModel.update({
    where: { id: modelId },
    data: { regionLock: "UNRESTRICTED" },
  });
  const second = await db.accessoryVariant.create({
    data: { accessoryId, name: "Silver", slug: slug() },
  });
  await db.accessoryVariantPlatform.create({
    data: { accessoryVariantId: variantId, platformId },
  });
  expect(
    await db.accessoryVariantPlatform.count({
      where: { accessoryVariantId: second.id },
    }),
  ).toBe(0);
  expect(await db.consoleModelRegion.count()).toBe(2);
});

it("enforces both scoped and unscoped publisher uniqueness and release-market membership", async () => {
  const data = {
    gameReleaseId: releaseId,
    companyId,
    role: "PUBLISHER" as const,
  };
  await db.gameReleaseCompany.create({ data });
  await expect(db.gameReleaseCompany.create({ data })).rejects.toThrow();
  await expect(
    db.gameReleaseCompany.create({ data: { ...data, regionId } }),
  ).rejects.toThrow();
  await db.gameReleaseRegion.create({
    data: { gameReleaseId: releaseId, regionId },
  });
  await db.gameReleaseCompany.create({ data: { ...data, regionId } });
  await expect(
    db.gameReleaseCompany.create({ data: { ...data, regionId } }),
  ).rejects.toThrow();
  await expect(
    db.gameReleaseRegion.delete({
      where: { gameReleaseId_regionId: { gameReleaseId: releaseId, regionId } },
    }),
  ).rejects.toThrow();
  await db.gameRelease.delete({ where: { id: releaseId } });
  expect(await db.gameReleaseCompany.count()).toBe(0);
  expect(await db.gameReleaseRegion.count()).toBe(0);
});

it.each([
  { releaseMonth: 1 },
  { releaseYear: 2024, releaseDay: 1 },
  { releaseYear: 2023, releaseMonth: 2, releaseDay: 29 },
  { releaseYear: 1900, releaseMonth: 2, releaseDay: 29 },
  { releaseYear: 2024, releaseMonth: 4, releaseDay: 31 },
  { releaseYear: 0 },
  { releaseYear: 2024, releaseMonth: 13 },
])("rejects invalid or missing-prefix market dates: %j", async (date) => {
  await expect(
    db.gameReleaseRegion.create({
      data: { gameReleaseId: releaseId, regionId, ...date },
    }),
  ).rejects.toThrow();
});

it.each([
  {},
  { releaseYear: 2024 },
  { releaseYear: 2024, releaseMonth: 2 },
  { releaseYear: 2000, releaseMonth: 2, releaseDay: 29 },
])("preserves unknown and valid partial market dates: %j", async (date) => {
  await expect(
    db.gameReleaseRegion.create({
      data: { gameReleaseId: releaseId, regionId, ...date },
    }),
  ).resolves.toMatchObject(date);
});

it("rejects target-less, multi-target and dangling product identifiers", async () => {
  const value = {
    scheme: "EAN" as const,
    value: "001",
    normalizedValue: "001",
  };
  for (const target of [
    {},
    { consoleModelId: modelId, gameReleaseId: releaseId },
    { gameReleaseId: randomUUID() },
  ])
    await expect(
      db.productIdentifier.create({ data: { ...value, ...target } }),
    ).rejects.toThrow();
  await db.productIdentifier.create({
    data: { ...value, gameReleaseId: releaseId },
  });
  await expect(
    db.productIdentifier.create({
      data: { ...value, gameReleaseId: releaseId },
    }),
  ).rejects.toThrow();
});

it("enforces exactly one explicit external target and target-scoped ID/URL uniqueness", async () => {
  const url = "https://example.com/game";
  const reference = { provider: "official", url, normalizedUrl: url };
  await expect(
    db.externalReference.create({ data: reference }),
  ).rejects.toThrow();
  await expect(
    db.externalReference.create({
      data: { ...reference, gameId, gameReleaseId: releaseId },
    }),
  ).rejects.toThrow();
  await db.externalReference.create({ data: { ...reference, gameId } });
  await expect(
    db.externalReference.create({ data: { ...reference, gameId } }),
  ).rejects.toThrow();
  await db.externalReference.create({
    data: { ...reference, gameReleaseId: releaseId },
  });
  const identified = {
    provider: "provider",
    providerObjectType: "game",
    externalId: "123",
    gameId,
  };
  await db.externalReference.create({ data: identified });
  await expect(
    db.externalReference.create({ data: identified }),
  ).rejects.toThrow();
  await expect(
    db.externalReference.create({
      data: { provider: "provider", externalId: "123", accessoryId },
    }),
  ).rejects.toThrow();
  await expect(db.game.delete({ where: { id: gameId } })).rejects.toThrow();
});

it("enforces normalized root/sibling location names, self-parent checks and occupied deletion", async () => {
  const root = await db.location.create({
    data: { name: "Home", normalizedName: "home", type: "PROPERTY" },
  });
  await expect(
    db.location.create({ data: { name: "HOME", normalizedName: "home" } }),
  ).rejects.toThrow();
  const sibling = { name: "Shelf", normalizedName: "shelf", parentId: root.id };
  const shelf = await db.location.create({ data: sibling });
  await expect(db.location.create({ data: sibling })).rejects.toThrow();
  await expect(
    db.location.update({ where: { id: root.id }, data: { parentId: root.id } }),
  ).rejects.toThrow();
  await expect(
    db.location.delete({ where: { id: root.id } }),
  ).rejects.toThrow();
  const copy = await item();
  await db.collectionItem.update({
    where: { id: copy.id },
    data: { locationId: shelf.id },
  });
  await expect(
    db.location.delete({ where: { id: shelf.id } }),
  ).rejects.toThrow();
});

it("requires repair timestamps and keeps accepted defects unresolved", async () => {
  const root = await item();
  const data = {
    collectionItemId: root.id,
    title: "Hinge",
    severity: "MAJOR" as const,
  };
  await expect(
    db.defect.create({ data: { ...data, status: "REPAIRED" } }),
  ).rejects.toThrow();
  await expect(
    db.defect.create({
      data: { ...data, status: "ACTIVE", resolvedAt: new Date() },
    }),
  ).rejects.toThrow();
  await db.defect.create({ data: { ...data, status: "ACCEPTED" } });
  await db.defect.create({
    data: {
      ...data,
      status: "REPAIRED",
      resolvedAt: new Date(),
      repairNote: "Replaced hinge",
    },
  });
  expect(
    await db.defect.count({
      where: { status: { in: ["ACTIVE", "ACCEPTED"] } },
    }),
  ).toBe(1);
});

it("requires one audit target, unique revision-field facts and immutable history", async () => {
  const data = {
    fieldPath: "name",
    before: Prisma.JsonNull,
    after: "Game",
    rootRevision: 1,
    origin: "MANUAL" as const,
  };
  await expect(db.metadataChange.create({ data })).rejects.toThrow();
  await expect(
    db.metadataChange.create({ data: { ...data, gameId, regionId } }),
  ).rejects.toThrow();
  const change = await db.metadataChange.create({ data: { ...data, gameId } });
  await expect(
    db.metadataChange.create({ data: { ...data, gameId } }),
  ).rejects.toThrow();
  await expect(
    db.metadataChange.update({
      where: { id: change.id },
      data: { after: "Changed" },
    }),
  ).rejects.toThrow();
  await expect(
    db.metadataChange.delete({ where: { id: change.id } }),
  ).rejects.toThrow();
});

it("user deletion nulls attribution while preserving collection, approval and metadata facts", async () => {
  const user = await db.user.create({
    data: { name: "Actor", email: `actor-${slug()}@example.com` },
  });
  const root = await item();
  await db.collectionItem.update({
    where: { id: root.id },
    data: {
      createdById: user.id,
      updatedById: user.id,
      publishedById: user.id,
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const change = await db.metadataChange.create({
    data: {
      companyId,
      fieldPath: "name",
      before: Prisma.JsonNull,
      after: "Maker",
      rootRevision: 1,
      origin: "MANUAL",
      actorId: user.id,
    },
  });
  await db.user.delete({ where: { id: user.id } });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id: root.id } }),
  ).toMatchObject({
    createdById: null,
    updatedById: null,
    publishedById: null,
    publicationStatus: "PUBLISHED",
  });
  expect(
    await db.metadataChange.findUniqueOrThrow({ where: { id: change.id } }),
  ).toMatchObject({ actorId: null, after: "Maker" });
});

it("accepts versioned technical data but rejects malformed JSON, nonpositive dimensions and revisions", async () => {
  await db.consoleModel.update({
    where: { id: modelId },
    data: {
      specifications: { schemaVersion: 1, data: { videoStandard: "NTSC" } },
      widthMm: "123.456",
      weightGrams: "200",
    },
  });
  for (const specifications of [
    {},
    { schemaVersion: 1 },
    { schemaVersion: 2, data: {} },
    [],
  ])
    await expect(
      db.consoleModel.update({
        where: { id: modelId },
        data: { specifications },
      }),
    ).rejects.toThrow();
  await expect(
    db.consoleModel.update({ where: { id: modelId }, data: { widthMm: 0 } }),
  ).rejects.toThrow();
  await expect(
    db.game.update({ where: { id: gameId }, data: { revision: 0 } }),
  ).rejects.toThrow();
});
