import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { withTransaction } from "@/server/db/transaction";
import {
  findAccessoryVariantIdentity,
  findConsoleModelIdentity,
  findGameReleaseIdentity,
} from "@/server/repositories/catalog/identities";
import { findCollectionItemIdentity } from "@/server/repositories/collection/identities";
import { findGrantByEmail, insertGrant } from "@/server/repositories/access";

const db = getDatabase();
let platformId: string;
let modelId: string;
let gameId: string;
let releaseId: string;
let accessoryId: string;
let variantId: string;
const copies = new Map<string, string>();
const privateMarker = "synthetic-private-evidence-not-a-display-field";

beforeEach(async () => {
  copies.clear();
  platformId = (
    await db.consolePlatform.create({
      data: { name: "Platform", slug: randomUUID(), history: privateMarker },
    })
  ).id;
  modelId = (
    await db.consoleModel.create({
      data: {
        name: "Model",
        slug: randomUUID(),
        platformId,
        specifications: { schemaVersion: 1, data: { evidence: privateMarker } },
      },
    })
  ).id;
  gameId = (
    await db.game.create({
      data: { name: "Game", slug: randomUUID(), description: privateMarker },
    })
  ).id;
  releaseId = (
    await db.gameRelease.create({
      data: {
        slug: randomUUID(),
        gameId,
        platformId,
        metadata: { schemaVersion: 1, data: { evidence: privateMarker } },
      },
    })
  ).id;
  accessoryId = (
    await db.accessory.create({
      data: {
        name: "Controller",
        slug: randomUUID(),
        description: privateMarker,
      },
    })
  ).id;
  variantId = (
    await db.accessoryVariant.create({
      data: {
        name: "Black",
        slug: randomUUID(),
        accessoryId,
        descriptionOverride: privateMarker,
      },
    })
  ).id;
  await db.externalReference.create({
    data: {
      gameReleaseId: releaseId,
      provider: "test",
      externalId: "provider-id",
      providerObjectType: "release",
      metadata: { schemaVersion: 1, data: { evidence: privateMarker } },
    },
  });
  for (const type of ["CONSOLE", "GAME", "ACCESSORY"] as const) {
    const root = await withTransaction(async (tx) => {
      const row = await tx.collectionItem.create({
        data: {
          type,
          notes: privateMarker,
          serialNumber: privateMarker,
          observedMarkings: privateMarker,
        },
      });
      if (type === "CONSOLE")
        await tx.ownedConsole.create({
          data: { collectionItemId: row.id, consoleModelId: modelId },
        });
      if (type === "GAME")
        await tx.ownedGame.create({
          data: { collectionItemId: row.id, gameReleaseId: releaseId },
        });
      if (type === "ACCESSORY")
        await tx.ownedAccessory.create({
          data: { collectionItemId: row.id, accessoryVariantId: variantId },
        });
      return row;
    });
    copies.set(type, root.id);
  }
});

afterEach(async () => {
  // Fixture maintenance in the disposable test database, never personal data.
  await db.$executeRaw`TRUNCATE TABLE company, region, console_platform, console_model, game, game_release, accessory, accessory_variant, collection_item, location CASCADE`;
});
afterAll(disconnectDatabase);

it("returns null for a missing identity without guessing from another entity type", async () => {
  const missing = randomUUID();
  expect(
    await Promise.all([
      findConsoleModelIdentity(missing),
      findGameReleaseIdentity(missing),
      findAccessoryVariantIdentity(missing),
      findCollectionItemIdentity(missing),
      findConsoleModelIdentity(platformId),
      findGameReleaseIdentity(gameId),
      findAccessoryVariantIdentity(accessoryId),
      findCollectionItemIdentity(releaseId),
    ]),
  ).toEqual(Array(8).fill(null));
});

it("loads product identities and their canonical parents without full ORM payloads", async () => {
  const model = await findConsoleModelIdentity(modelId);
  const release = await findGameReleaseIdentity(releaseId);
  const variant = await findAccessoryVariantIdentity(variantId);
  expect(model).toEqual({
    id: modelId,
    name: "Model",
    revision: 1,
    archivedAt: null,
    identificationStatus: "INCOMPLETE",
    platform: { id: platformId, name: "Platform", archivedAt: null },
  });
  expect(release).toEqual({
    id: releaseId,
    revision: 1,
    archivedAt: null,
    identificationStatus: "INCOMPLETE",
    game: { id: gameId, name: "Game", archivedAt: null },
    platform: { id: platformId, name: "Platform", archivedAt: null },
  });
  expect(variant).toEqual({
    id: variantId,
    name: "Black",
    revision: 1,
    archivedAt: null,
    identificationStatus: "INCOMPLETE",
    accessory: { id: accessoryId, name: "Controller", archivedAt: null },
  });
  expect(JSON.stringify([model, release, variant])).not.toContain(
    privateMarker,
  );
});

it.each(["CONSOLE", "GAME", "ACCESSORY"] as const)(
  "resolves a %s copy with just its aggregate identity and matching catalog pointer",
  async (type) => {
    const id = copies.get(type)!;
    const identity = await findCollectionItemIdentity(id);
    expect(identity).toEqual({
      id,
      type,
      revision: 1,
      ownedConsole: type === "CONSOLE" ? { consoleModelId: modelId } : null,
      ownedGame: type === "GAME" ? { gameReleaseId: releaseId } : null,
      ownedAccessory:
        type === "ACCESSORY" ? { accessoryVariantId: variantId } : null,
    });
    expect(JSON.stringify(identity)).not.toContain(privateMarker);
    expect(identity).not.toHaveProperty("publishedAt");
    expect(identity).not.toHaveProperty("createdById");
  },
);

it("keeps archived product and parent identities available for existing references", async () => {
  const archivedAt = new Date("2026-01-01T00:00:00Z");
  await db.consolePlatform.update({
    where: { id: platformId },
    data: { archivedAt },
  });
  await db.game.update({ where: { id: gameId }, data: { archivedAt } });
  await db.accessory.update({
    where: { id: accessoryId },
    data: { archivedAt },
  });
  await db.consoleModel.update({
    where: { id: modelId },
    data: { archivedAt },
  });
  await db.gameRelease.update({
    where: { id: releaseId },
    data: { archivedAt },
  });
  await db.accessoryVariant.update({
    where: { id: variantId },
    data: { archivedAt },
  });
  expect(await findConsoleModelIdentity(modelId)).toMatchObject({
    archivedAt,
    platform: { archivedAt },
  });
  expect(await findGameReleaseIdentity(releaseId)).toMatchObject({
    archivedAt,
    game: { archivedAt },
    platform: { archivedAt },
  });
  expect(await findAccessoryVariantIdentity(variantId)).toMatchObject({
    archivedAt,
    accessory: { archivedAt },
  });
  expect(await findCollectionItemIdentity(copies.get("GAME")!)).not.toBeNull();
});

it("uses the supplied transaction for uncommitted identity reads and preserves rollback", async () => {
  const id = randomUUID();
  await expect(
    withTransaction(async (tx) => {
      await tx.gameRelease.create({
        data: { id, slug: randomUUID(), gameId, platformId },
      });
      expect(await findGameReleaseIdentity(id, tx)).toMatchObject({
        id,
        game: { id: gameId },
      });
      expect(await findGameReleaseIdentity(id)).toBeNull();
      throw new Error("Rollback probe");
    }),
  ).rejects.toThrow("Rollback probe");
  expect(await findGameReleaseIdentity(id)).toBeNull();
});

it("reads all three product identities and the copy revision through the same transaction", async () => {
  const id = copies.get("GAME")!;
  await withTransaction(async (tx) => {
    await tx.collectionItem.update({ where: { id }, data: { revision: 2 } });
    await tx.consoleModel.update({
      where: { id: modelId },
      data: { revision: 2 },
    });
    await tx.gameRelease.update({
      where: { id: releaseId },
      data: { revision: 2 },
    });
    await tx.accessoryVariant.update({
      where: { id: variantId },
      data: { revision: 2 },
    });
    for (const record of [
      await findCollectionItemIdentity(id, tx),
      await findConsoleModelIdentity(modelId, tx),
      await findGameReleaseIdentity(releaseId, tx),
      await findAccessoryVariantIdentity(variantId, tx),
    ]) {
      expect(record?.revision).toBe(2);
    }
    expect((await findCollectionItemIdentity(id))?.revision).toBe(1);
  });
  expect((await findCollectionItemIdentity(id))?.revision).toBe(2);
});

it("keeps existing access writes and reads inside their caller-owned transaction", async () => {
  const email = `${randomUUID()}@example.com`;
  await expect(
    withTransaction(async (tx) => {
      await insertGrant({ email, role: "VIEWER", enabled: false }, tx);
      expect(await findGrantByEmail(email, tx)).toMatchObject({
        email,
        role: "VIEWER",
        enabled: false,
      });
      expect(await findGrantByEmail(email)).toBeNull();
      throw new Error("Rollback probe");
    }),
  ).rejects.toThrow("Rollback probe");
  expect(await findGrantByEmail(email)).toBeNull();
});
