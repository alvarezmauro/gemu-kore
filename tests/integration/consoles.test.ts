import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import {
  createConsole,
  findConsoleModels,
  findConsolePlatforms,
  getConsoleCreation,
  activateNewConsoleOverride,
} from "@/server/services/collection/consoles";
import * as catalog from "@/server/repositories/catalog/management";
import * as repository from "@/server/repositories/collection/consoles";
import { emptyConsolePhysical } from "@/features/consoles/validation";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
const db = getDatabase();
const secret = "console-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Console fixture", email, emailVerified: true },
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
async function hardware() {
  const company = await db.company.create({
    data: { name: "Sony", slug: randomUUID() },
  });
  const platform = await db.consolePlatform.create({
    data: {
      name: "PlayStation",
      aliases: ["PSX"],
      slug: randomUUID(),
      manufacturerId: company.id,
      originalReleaseYear: 1994,
      generation: 5,
    },
  });
  const model = await db.consoleModel.create({
    data: {
      name: "SCPH-1000",
      modelNumber: "SCPH-1000",
      platformId: platform.id,
      slug: randomUUID(),
    },
  });
  const region = await db.region.create({
    data: { name: "Japan", code: randomUUID(), slug: randomUUID() },
  });
  await db.consoleModelRegion.create({
    data: { consoleModelId: model.id, regionId: region.id },
  });
  const input = {
    ...emptyConsolePhysical,
    id: randomUUID(),
    platformId: platform.id,
    platformRevision: platform.revision,
    modelId: model.id,
    modelRevision: model.revision,
  };
  return { platform, model, input };
}
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, collection_item CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("GITHUB_CLIENT_ID", "");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "");
  await reset();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await reset();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});
it("returns an empty creation form without inventing or importing catalog data", async () => {
  const { context } = await actor();
  expect(await getConsoleCreation(context)).toEqual({
    platforms: { items: [], hasMore: false, page: 0 },
    locations: [],
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it("allows editors to select active hardware with bounded safe DTOs, literal searches and case-insensitive aliases", async () => {
  const { context } = await actor();
  const { platform, model } = await hardware();
  const result = await findConsolePlatforms(context, { query: "psx" });
  expect(result.items).toMatchObject([
    { name: "PlayStation", manufacturer: "Sony", generation: 5 },
  ]);
  expect((await findConsolePlatforms(context, { query: "%" })).items).toEqual(
    [],
  );
  const models = await findConsoleModels(context, { platformId: platform.id });
  expect(models.items).toMatchObject([
    {
      id: model.id,
      manufacturer: null,
      markets: ["Japan"],
      identificationStatus: "INCOMPLETE",
    },
  ]);
  expect(JSON.stringify({ result, models })).not.toMatch(
    /seedKey|storageNamespace|objectKey|createdById|notes/,
  );
  await db.consoleModel.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      name: `Revision ${i}`,
      slug: randomUUID(),
      platformId: platform.id,
    })),
  });
  expect(
    await findConsoleModels(context, { platformId: platform.id }),
  ).toMatchObject({ hasMore: true, items: expect.any(Array) });
  expect(
    (await findConsoleModels(context, { platformId: platform.id, page: 1 }))
      .items,
  ).toHaveLength(2);
  await db.consoleModel.update({
    where: { id: model.id },
    data: { archivedAt: new Date() },
  });
  expect(
    (
      await findConsoleModels(context, {
        platformId: platform.id,
        query: "SCPH",
      })
    ).items,
  ).toEqual([]);
  await db.consolePlatform.update({
    where: { id: platform.id },
    data: { archivedAt: new Date() },
  });
  expect((await findConsolePlatforms(context, {})).items).toEqual([]);
  expect(
    (await findConsoleModels(context, { platformId: platform.id })).items,
  ).toEqual([]);
});
it("creates private root/subtype/defects atomically, preserves canonical facts and permits multiple physical copies", async () => {
  const { context, user } = await actor();
  const { input, model } = await hardware();
  const location = await db.location.create({
    data: { name: "Shelf", normalizedName: "shelf" },
  });
  const before = await db.consoleModel.findUniqueOrThrow({
    where: { id: model.id },
  });
  const request = {
    ...input,
    locationId: location.id,
    serialNumber: " 00001 ",
    observedMarkings: "Possible replacement case",
    hasBox: "no",
    notes: "Private",
    defects: [
      { title: "Yellowing", description: "Top shell", severity: "COSMETIC" },
    ],
  };
  const id = await createConsole(context, request);
  expect(
    await db.collectionItem.findUniqueOrThrow({
      where: { id },
      include: { ownedConsole: true, defects: true },
    }),
  ).toMatchObject({
    type: "CONSOLE",
    publicationStatus: "PRIVATE",
    hasBox: false,
    serialNumber: "00001",
    createdById: user.id,
    locationId: location.id,
    revision: 1,
    ownedConsole: { consoleModelId: model.id },
    defects: [{ title: "Yellowing", severity: "COSMETIC", status: "ACTIVE" }],
  });
  expect(
    await db.consoleModel.findUniqueOrThrow({ where: { id: model.id } }),
  ).toEqual(before);
  expect(await db.metadataChange.count()).toBe(0);
  await createConsole(context, { ...input, id: randomUUID() });
  expect(await db.collectionItem.count()).toBe(2);
});
it("deduplicates concurrent/repeated saves of one reference without hiding a changed request", async () => {
  const { context } = await actor();
  const { input } = await hardware();
  expect(
    await Promise.all([
      createConsole(context, input),
      createConsole(context, input),
    ]),
  ).toEqual([input.id, input.id]);
  expect(await db.collectionItem.count()).toBe(1);
  await expect(
    createConsole(context, { ...input, notes: "Different" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const other = await actor();
  await expect(createConsole(other.context, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await db.collectionItem.count()).toBe(1);
});
it.each(["platform", "model"] as const)(
  "rejects a stale or archived %s without creating a copy",
  async (kind) => {
    const { context } = await actor();
    const { platform, model, input } = await hardware();
    if (kind === "platform")
      await db.consolePlatform.update({
        where: { id: platform.id },
        data: { revision: 2 },
      });
    else
      await db.consoleModel.update({
        where: { id: model.id },
        data: { archivedAt: new Date() },
      });
    await expect(createConsole(context, input)).rejects.toMatchObject({
      code: "STALE",
    });
    expect(await db.collectionItem.count()).toBe(0);
  },
);
it("rejects mismatched model/platform identity, deleted locations and injected publication data", async () => {
  const { context } = await actor();
  const { input } = await hardware();
  const other = await db.consolePlatform.create({
    data: { name: "Other", slug: randomUUID() },
  });
  await expect(
    createConsole(context, { ...input, platformId: other.id }),
  ).rejects.toMatchObject({ code: "STALE" });
  await expect(
    createConsole(context, { ...input, locationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    createConsole(context, { ...input, publicationStatus: "PUBLISHED" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await db.collectionItem.count()).toBe(0);
});
it("denies viewers and rechecks role changes after waiting for the write lock", async () => {
  const viewer = await actor("VIEWER");
  const { input } = await hardware();
  for (const call of [
    () => getConsoleCreation(viewer.context),
    () => createConsole(viewer.context, input),
    () => findConsoleModels(viewer.context, { platformId: input.platformId }),
  ])
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { context, grant } = await actor();
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(createConsole(context, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(await db.collectionItem.count()).toBe(0);
});
it("denies expired and revoked contexts", async () => {
  const { context, session, grant } = await actor();
  const { input } = await hardware();
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(createConsole(context, input)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + 86400000) },
  });
  await db.accessGrant.update({
    where: { id: grant.id },
    data: { enabled: false },
  });
  await expect(findConsolePlatforms(context, {})).rejects.toMatchObject({
    code: "DENIED",
  });
});
it("rolls back root, subtype and defects if persistence fails after insertion", async () => {
  const { context } = await actor();
  const { input } = await hardware();
  const insert = repository.insertConsole;
  vi.spyOn(repository, "insertConsole").mockImplementation(async (data, tx) => {
    await insert(data, tx);
    throw new Error("deliberate failure");
  });
  await expect(
    createConsole(context, {
      ...input,
      defects: [{ title: "Scratch", severity: "MINOR", description: "" }],
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(await db.collectionItem.count()).toBe(0);
  expect(await db.ownedConsole.count()).toBe(0);
  expect(await db.defect.count()).toBe(0);
});
async function override(
  collectionItemId: string,
  kind: "IMAGE" | "MODEL_3D" = "IMAGE",
) {
  const asset = await db.asset.create({
    data: {
      kind,
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: kind === "IMAGE" ? "DISPLAY" : "ORIGINAL",
      mimeType: kind === "IMAGE" ? "image/webp" : "model/gltf-binary",
      sizeBytes: 1,
      sha256: "a".repeat(64),
      ...(kind === "IMAGE" ? { width: 20, height: 20 } : {}),
      storageNamespace: "fixture",
      objectKey: randomUUID(),
    },
  });
  return db.collectionItemMedia.create({
    data: {
      collectionItemId,
      assetId: asset.id,
      type: kind === "IMAGE" ? "CUSTOM_LOGO" : "CUSTOM_MODEL",
    },
  });
}
it.each(["IMAGE", "MODEL_3D"] as const)(
  "activates a ready %s override privately and idempotently, without replacing another selection",
  async (kind) => {
    const { context } = await actor();
    const { input } = await hardware();
    const id = await createConsole(context, input);
    const use = await override(id, kind);
    const request = { collectionItemId: id, useId: use.id, type: use.type };
    await activateNewConsoleOverride(context, request);
    await activateNewConsoleOverride(context, request);
    expect(
      await db.collectionItemMedia.findUniqueOrThrow({ where: { id: use.id } }),
    ).toMatchObject({ isPrimary: true, publicApproved: false });
    expect(
      await db.collectionItem.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ revision: 2, publicationStatus: "PRIVATE" });
    const another = await override(id, kind);
    await expect(
      activateNewConsoleOverride(context, { ...request, useId: another.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.catalogAsset.count()).toBe(0);
  },
);
it("rejects an override belonging to another copy and files without a completed use", async () => {
  const { context } = await actor();
  const { input } = await hardware();
  const first = await createConsole(context, input);
  const second = await createConsole(context, { ...input, id: randomUUID() });
  const use = await override(first);
  await expect(
    activateNewConsoleOverride(context, {
      collectionItemId: second,
      useId: use.id,
      type: "CUSTOM_LOGO",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const pending = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      storageNamespace: "fixture",
      objectKey: randomUUID(),
    },
  });
  await expect(
    activateNewConsoleOverride(context, {
      collectionItemId: first,
      useId: pending.id,
      type: "CUSTOM_LOGO",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
