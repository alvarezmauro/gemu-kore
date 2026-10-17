import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { requirePrivateAccess } from "@/server/auth/access";
import {
  saveGameCatalog,
  getGameCatalog,
  archiveGameCatalog,
} from "@/server/services/catalog/games";
import { lookupCatalog } from "@/server/services/catalog/management";
import * as repository from "@/server/repositories/catalog/games";
import * as shared from "@/server/repositories/catalog/management";
import { gameInput, releaseInput } from "../helpers/game-catalog-input";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase(),
  secret = "game-catalog-integration-secret-longer-than-thirty-two";
async function actor(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Game curator", email, emailVerified: true },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await db.accessGrant.create({
    data: { email, role, enabled: true },
  });
  const context = await requirePrivateAccess(
    new Headers({
      Cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    }),
  );
  return { user, session, grant, context };
}
async function setup() {
  const { context } = await actor();
  const platform = await db.consolePlatform.create({
    data: { name: "SNES", slug: randomUUID() },
  });
  const company = await db.company.create({
    data: { name: "Square", slug: randomUUID() },
  });
  const region = await db.region.create({
    data: { name: "North America", code: "NA", slug: randomUUID() },
  });
  const gameId = await saveGameCatalog(context, {
    ...gameInput(),
    fields: {
      ...gameInput().fields,
      developers: [
        { companyId: company.id, creditLabel: "Original developer" },
      ],
    },
  });
  return {
    context,
    platform,
    company,
    region,
    gameId,
    input: releaseInput(gameId, platform.id),
  };
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  await db.$executeRaw`TRUNCATE TABLE company, region, console_platform, game, accessory CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await disconnectDatabase();
});
it("starts empty and persists separate game/release identities, credits and flat expected contents", async () => {
  const s = await setup();
  const input = {
    ...s.input,
    fields: {
      ...s.input.fields,
      editionName: "Limited",
      editionType: "LIMITED",
      markets: [{ regionId: s.region.id, year: "1995", month: "3", day: "" }],
      credits: [
        {
          companyId: s.company.id,
          role: "PUBLISHER",
          regionId: s.region.id,
          creditLabel: "North American publisher",
        },
      ],
      includedItems: [
        {
          name: "Disc 1",
          kind: "MEDIA",
          description: "First disc",
          quantity: 1,
        },
        {
          name: "Disc 2",
          kind: "MEDIA",
          description: "Second disc",
          quantity: 1,
        },
      ],
    },
  };
  const id = await saveGameCatalog(s.context, input);
  const data = await getGameCatalog(s.context, { kind: "release", id });
  expect(data.selected).toMatchObject({
    kind: "release",
    fields: {
      gameId: s.gameId,
      platformId: s.platform.id,
      markets: [{ year: "1995", month: "3", day: "" }],
      includedItems: [{ name: "Disc 1" }, { name: "Disc 2" }],
    },
  });
  expect(data.history.some((h) => h.fieldPath === "includedItems")).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(
    /objectKey|storageNamespace|sha256|createdById|seedKey/,
  );
  const other = await saveGameCatalog(s.context, {
    ...input,
    fields: { ...input.fields, slug: "another-printing" },
  });
  expect(other).not.toBe(id);
  expect(await db.game.count()).toBe(1);
  expect(await db.ownedGame.count()).toBe(0);
});
it("retains component identity, edits market dates atomically and records manual history", async () => {
  const s = await setup();
  const id = await saveGameCatalog(s.context, {
    ...s.input,
    fields: {
      ...s.input.fields,
      markets: [{ regionId: s.region.id, year: "1995", month: "", day: "" }],
      credits: [
        {
          companyId: s.company.id,
          role: "PUBLISHER",
          regionId: s.region.id,
          creditLabel: "",
        },
      ],
      includedItems: [
        { name: "Manual", kind: "MANUAL", description: "", quantity: 1 },
      ],
    },
  });
  const before = (await getGameCatalog(s.context, { kind: "release", id }))
    .selected!;
  if (before.kind !== "release") throw Error();
  const componentId = before.fields.includedItems[0].id;
  await saveGameCatalog(s.context, {
    kind: "release",
    id,
    expectedRevision: before.revision,
    references: [],
    fields: {
      ...before.fields,
      markets: [],
      credits: [],
      includedItems: [{ ...before.fields.includedItems[0], quantity: 2 }],
    },
  });
  const after = await db.gameRelease.findUniqueOrThrow({
    where: { id },
    include: { regions: true, companies: true, includedItems: true },
  });
  expect(after).toMatchObject({
    revision: 2,
    regions: [],
    companies: [],
    includedItems: [{ id: componentId, quantity: 2 }],
  });
  expect(
    await db.metadataChange.count({
      where: { gameReleaseId: id, rootRevision: 2, origin: "MANUAL" },
    }),
  ).toBeGreaterThan(0);
});
it("rejects invalid calendar dates, nonexistent relations, foreign components and foreign source IDs without partial writes", async () => {
  const s = await setup();
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      fields: {
        ...s.input.fields,
        markets: [
          { regionId: s.region.id, year: "1900", month: "2", day: "29" },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      fields: { ...s.input.fields, platformId: randomUUID() },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const foreign = await db.gameRelease.create({
    data: {
      gameId: s.gameId,
      platformId: s.platform.id,
      slug: "foreign",
      includedItems: { create: { name: "Manual", kind: "MANUAL" } },
    },
    include: { includedItems: true },
  });
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      fields: {
        ...s.input.fields,
        includedItems: [
          {
            id: foreign.includedItems[0].id,
            name: "Hijack",
            kind: "MANUAL",
            description: "",
            quantity: 1,
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const ref = await db.externalReference.create({
    data: {
      gameId: s.gameId,
      provider: "wiki",
      url: "https://example.com",
      normalizedUrl: "https://example.com/",
    },
  });
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      references: [
        {
          id: ref.id,
          provider: "wiki",
          providerObjectType: "",
          externalId: "",
          url: "https://example.com",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.gameRelease.count()).toBe(1);
  expect(await db.gameReleaseIncludedItem.count()).toBe(1);
});
it("restricts all catalog reads/writes to current administrators including grant changes behind the lock", async () => {
  const s = await setup();
  for (const role of ["EDITOR", "VIEWER"] as const) {
    const { context } = await actor(role);
    await expect(saveGameCatalog(context, s.input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getGameCatalog(context, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      archiveGameCatalog(context, {
        kind: "game",
        id: s.gameId,
        expectedRevision: 1,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  const admin = await actor();
  const original = shared.lockCatalogWrites;
  vi.spyOn(shared, "lockCatalogWrites").mockImplementationOnce(async (tx) => {
    await db.accessGrant.update({
      where: { id: admin.grant.id },
      data: { role: "VIEWER" },
    });
    return original(tx);
  });
  await expect(saveGameCatalog(admin.context, s.input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(await db.gameRelease.count()).toBe(0);
});
it("rejects stale/concurrent edits, archives without deleting references and permits retaining archived links", async () => {
  const s = await setup();
  const id = await saveGameCatalog(s.context, s.input);
  const before = (await getGameCatalog(s.context, { kind: "release", id }))
    .selected!;
  if (before.kind !== "release") throw Error();
  const results = await Promise.allSettled(
    ["A", "B"].map((editionName) =>
      saveGameCatalog(s.context, {
        kind: "release",
        id,
        expectedRevision: 1,
        fields: { ...before.fields, editionName },
        references: [],
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "STALE" },
  });
  await archiveGameCatalog(s.context, {
    kind: "game",
    id: s.gameId,
    expectedRevision: 1,
    archived: true,
  });
  const current = (await getGameCatalog(s.context, { kind: "release", id }))
    .selected!;
  if (current.kind !== "release") throw Error();
  await saveGameCatalog(s.context, {
    kind: "release",
    id,
    expectedRevision: 2,
    fields: { ...current.fields, printingLabel: "Known printing" },
    references: [],
  });
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      fields: { ...s.input.fields, slug: "new-archived-game" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.gameRelease.count()).toBe(1);
  await archiveGameCatalog(s.context, {
    kind: "game",
    id: s.gameId,
    expectedRevision: 2,
    archived: false,
  });
  expect(
    (await db.game.findUniqueOrThrow({ where: { id: s.gameId } })).archivedAt,
  ).toBeNull();
});
it("rolls back root, children and history on failure and rejects redundant Worldwide markets", async () => {
  const s = await setup();
  const before = await db.metadataChange.count();
  vi.spyOn(repository, "setReleaseDetails").mockRejectedValueOnce(
    new Error("synthetic failure"),
  );
  await expect(saveGameCatalog(s.context, s.input)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(await db.gameRelease.count()).toBe(0);
  expect(await db.metadataChange.count()).toBe(before);
  const world = await db.region.create({
    data: { name: "Worldwide", code: "WW", slug: "worldwide" },
  });
  await expect(
    saveGameCatalog(s.context, {
      ...s.input,
      fields: {
        ...s.input.fields,
        markets: [s.region.id, world.id].map((regionId) => ({
          regionId,
          year: "",
          month: "",
          day: "",
        })),
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("enforces quantity, component kind, relationship and asset-target invariants directly in PostgreSQL", async () => {
  const s = await setup(),
    id = await saveGameCatalog(s.context, s.input);
  await expect(
    db.gameReleaseIncludedItem.create({
      data: { gameReleaseId: id, name: "Invalid", kind: "MANUAL", quantity: 0 },
    }),
  ).rejects.toThrow();
  await expect(
    db.gameReleaseIncludedItem.create({
      data: { gameReleaseId: randomUUID(), name: "Orphan", kind: "MEDIA" },
    }),
  ).rejects.toThrow();
  const component = await db.gameReleaseIncludedItem.create({
    data: { gameReleaseId: id, name: "Manual", kind: "MANUAL" },
  });
  await expect(db.gameRelease.delete({ where: { id } })).rejects.toThrow();
  const asset = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "READY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      deliveryClass: "DISPLAY",
      sha256: "a".repeat(64),
      width: 20,
      height: 20,
      sizeBytes: 1,
    },
  });
  await db.catalogAsset.create({
    data: {
      assetId: asset.id,
      includedItemId: component.id,
      role: "GALLERY",
      isPrimary: true,
    },
  });
  await expect(
    db.catalogAsset.create({
      data: {
        assetId: asset.id,
        includedItemId: component.id,
        gameId: s.gameId,
        role: "GALLERY",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.catalogAsset.create({
      data: {
        assetId: asset.id,
        includedItemId: component.id,
        role: "GALLERY",
        isPrimary: true,
      },
    }),
  ).rejects.toThrow();
  await db.gameReleaseIncludedItem.delete({ where: { id: component.id } });
  expect(await db.asset.count()).toBe(1);
  expect(await db.catalogAsset.count()).toBe(0);
});

it("distinguishes same-title conceptual games by slug in bounded literal lookups", async () => {
  const s = await setup();
  await saveGameCatalog(
    s.context,
    gameInput("Chrono Trigger", "chrono-trigger-remake"),
  );
  const matches = await lookupCatalog(s.context, {
    kind: "game",
    query: "Chrono Trigger",
  });
  expect(matches).toHaveLength(2);
  expect(matches.map((m) => m.detail).sort()).toEqual([
    "chrono-trigger",
    "chrono-trigger-remake",
  ]);
  expect(
    await lookupCatalog(s.context, { kind: "game", query: "remake" }),
  ).toHaveLength(1);
  expect(await lookupCatalog(s.context, { kind: "game", query: "%" })).toEqual(
    [],
  );
});
