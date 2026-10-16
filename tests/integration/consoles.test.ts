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
  await db.$executeRaw`TRUNCATE TABLE asset, location, company, region, console_platform, collection_item, accessory CASCADE`;
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

// Existing-copy management uses the same aggregate revision as defects/media.
import {
  getOwnedConsole,
  mutateOwnedConsole,
} from "@/server/services/collection/console-management";
import * as management from "@/server/repositories/collection/console-management";
import { mutateDefect } from "@/server/services/collection/defects";
async function existing() {
  const who = await actor();
  const hw = await hardware();
  const id = await createConsole(who.context, hw.input);
  const { defects: _defects, ...fields } = hw.input;
  void _defects;
  return {
    ...who,
    ...hw,
    id,
    request: { ...fields, operation: "update", expectedRevision: 1 },
  };
}
it("reads a copy for viewers without edit choices, exposes bounded DTOs and keeps canonical/private information separate", async () => {
  const { id, model, platform } = await existing();
  await db.consolePlatform.update({
    where: { id: platform.id },
    data: { description: "Shared description", history: "Shared history" },
  });
  await db.consoleModel.update({
    where: { id: model.id },
    data: {
      widthMm: 10,
      specifications: { schemaVersion: 1, data: { cpu: "MIPS" } },
    },
  });
  await db.collectionItem.update({
    where: { id },
    data: { notes: "Private copy", serialNumber: "00009" },
  });
  const viewer = await actor("VIEWER");
  const data = await getOwnedConsole(viewer.context, { id });
  expect(data).toMatchObject({
    canManage: false,
    locations: [],
    detail: {
      id,
      fields: { notes: "Private copy", serialNumber: "00009" },
      description: "Shared description",
      history: "Shared history",
      model: { name: model.name, markets: ["Japan"] },
      photos: [],
      overrides: [],
    },
  });
  expect(data.detail.facts).toEqual(
    expect.arrayContaining([
      { label: "Width (mm)", value: "10" },
      { label: "cpu", value: "MIPS" },
    ]),
  );
  expect(JSON.stringify(data)).not.toMatch(
    /storageNamespace|objectKey|sha256|createdById|seedKey/,
  );
});
it("edits another editor's copy atomically without changing canonical facts, defects, media or a sibling copy", async () => {
  const { id, input, model, request, context } = await existing();
  const sibling = await createConsole(context, { ...input, id: randomUUID() });
  const defect = await db.defect.create({
    data: { collectionItemId: id, title: "Scratch", severity: "COSMETIC" },
  });
  const use = await override(id);
  const location = await db.location.create({
    data: { name: "Shelf", normalizedName: "shelf" },
  });
  const before = await db.consoleModel.findUniqueOrThrow({
    where: { id: model.id },
  });
  const editor = await actor();
  await mutateOwnedConsole(editor.context, {
    ...request,
    serialNumber: " 01234 ",
    notes: "Updated",
    hasBox: "no",
    locationId: location.id,
  });
  expect(
    await db.collectionItem.findUniqueOrThrow({
      where: { id },
      include: { defects: true, media: true },
    }),
  ).toMatchObject({
    revision: 2,
    updatedById: editor.user.id,
    serialNumber: "01234",
    hasBox: false,
    locationId: location.id,
    defects: [{ id: defect.id }],
    media: [{ id: use.id }],
  });
  expect(
    await db.consoleModel.findUniqueOrThrow({ where: { id: model.id } }),
  ).toEqual(before);
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id: sibling } }),
  ).toMatchObject({ revision: 1, notes: null });
});
it("preserves publication/revision on no-op; a meaningful change unpublishes the copy", async () => {
  const { id, request, context, user } = await existing();
  await db.collectionItem.update({
    where: { id },
    data: {
      publicationStatus: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: user.id,
    },
  });
  await mutateOwnedConsole(context, request);
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ revision: 1, publicationStatus: "PUBLISHED" });
  await mutateOwnedConsole(context, { ...request, notes: "Changed" });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({
    revision: 2,
    publicationStatus: "PRIVATE",
    publishedAt: null,
    publishedById: null,
  });
});
it("rejects concurrent and stale edits without overwriting the winning copy", async () => {
  const { id, request, context } = await existing();
  const outcomes = await Promise.allSettled([
    mutateOwnedConsole(context, { ...request, notes: "First" }),
    mutateOwnedConsole(context, { ...request, notes: "Second" }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "COPY_STALE" },
  });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ revision: 2 });
  await expect(
    mutateOwnedConsole(context, {
      operation: "delete",
      id,
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
});
it("can retain an archived identity and re-identify only to a current matching model", async () => {
  const { id, request, context, model, platform } = await existing();
  await db.consoleModel.update({
    where: { id: model.id },
    data: { archivedAt: new Date() },
  });
  await db.consolePlatform.update({
    where: { id: platform.id },
    data: { archivedAt: new Date() },
  });
  await mutateOwnedConsole(context, { ...request, notes: "Retained" });
  expect((await getOwnedConsole(context, { id })).detail).toMatchObject({
    model: { archived: true },
    platform: { archived: true },
  });
  const replacement = await hardware();
  await mutateOwnedConsole(context, {
    ...request,
    expectedRevision: 2,
    platformId: replacement.platform.id,
    modelId: replacement.model.id,
  });
  expect(
    await db.ownedConsole.findUniqueOrThrow({
      where: { collectionItemId: id },
    }),
  ).toMatchObject({ consoleModelId: replacement.model.id });
  await expect(
    mutateOwnedConsole(context, { ...request, expectedRevision: 3 }),
  ).rejects.toMatchObject({ code: "STALE" });
});
it("rejects stale catalog revisions, mismatched identity, missing locations and injected canonical/public fields", async () => {
  const { context, request, model } = await existing();
  for (const patch of [
    { platformRevision: 2 },
    { modelRevision: 2 },
    { platformId: randomUUID() },
    { modelId: randomUUID() },
  ])
    await expect(
      mutateOwnedConsole(context, { ...request, ...patch }),
    ).rejects.toMatchObject({ code: "STALE" });
  await expect(
    mutateOwnedConsole(context, { ...request, locationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  for (const key of [
    "publicationStatus",
    "manufacturerId",
    "regionId",
    "defects",
    "createdById",
  ])
    await expect(
      mutateOwnedConsole(context, { ...request, [key]: "injected" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await db.consoleModel.update({
    where: { id: model.id },
    data: { revision: 2 },
  });
  await expect(mutateOwnedConsole(context, request)).rejects.toMatchObject({
    code: "STALE",
  });
});
it("denies all viewer mutations and rechecks changed grants after waiting for the copy lock", async () => {
  const { id, request, context, grant } = await existing();
  const viewer = await actor("VIEWER");
  for (const input of [
    request,
    { operation: "delete", id, expectedRevision: 1 },
    {
      operation: "override",
      id,
      expectedRevision: 1,
      type: "CUSTOM_LOGO",
      useId: null,
    },
    {
      operation: "removeOverride",
      id,
      expectedRevision: 1,
      useId: randomUUID(),
    },
  ])
    await expect(
      mutateOwnedConsole(viewer.context, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const lock = catalog.lockCatalogWrites;
  vi.spyOn(catalog, "lockCatalogWrites").mockImplementation(async (tx) => {
    await lock(tx);
    await db.accessGrant.update({
      where: { id: grant.id },
      data: { role: "VIEWER" },
    });
  });
  await expect(mutateOwnedConsole(context, request)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it("rejects missing or non-console copies without disclosing another item type", async () => {
  const { id, context, request } = await existing();
  const accessory = await db.accessory.create({
    data: { name: "Controller", slug: randomUUID() },
  });
  const variant = await db.accessoryVariant.create({
    data: {
      name: "Controller variant",
      slug: randomUUID(),
      accessoryId: accessory.id,
    },
  });
  const other = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      ownedAccessory: { create: { accessoryVariantId: variant.id } },
    },
  });
  for (const invalid of [randomUUID(), "bad-id", other.id]) {
    await expect(
      getOwnedConsole(context, { id: invalid }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await mutateOwnedConsole(context, {
    operation: "delete",
    id,
    expectedRevision: 1,
  });
  await expect(mutateOwnedConsole(context, request)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it.each(["IMAGE", "MODEL_3D"] as const)(
  "replaces and clears %s overrides privately, preserves stored files, and falls back to catalog assets",
  async (kind) => {
    const { id, context, platform, model, user } = await existing();
    const first = await override(id, kind),
      second = await override(id, kind);
    const assetId = first.assetId;
    const catalogUse = await db.catalogAsset.create({
      data: {
        consolePlatformId: platform.id,
        assetId: (await catalogFile(kind)).id,
        role: kind === "IMAGE" ? "LOGO" : "MODEL_3D",
        isPrimary: true,
      },
    });
    const mutation = {
      operation: "override",
      id,
      expectedRevision: 1,
      type: first.type,
      useId: first.id,
    };
    await mutateOwnedConsole(context, mutation);
    if (kind === "IMAGE") {
      await db.asset.update({
        where: { id: first.assetId },
        data: {
          publicSafe: true,
          rightsStatus: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
      });
      await db.collectionItemMedia.update({
        where: { id: first.id },
        data: { publicDisplayAssetId: first.assetId },
      });
      await db.collectionItemMedia.update({
        where: { id: first.id },
        data: {
          publicApproved: true,
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });
    }
    await mutateOwnedConsole(context, {
      ...mutation,
      expectedRevision: 2,
      useId: second.id,
    });
    expect(
      await db.collectionItemMedia.findUniqueOrThrow({
        where: { id: first.id },
      }),
    ).toMatchObject({
      isPrimary: false,
      publicApproved: false,
      approvedById: null,
      approvedAt: null,
    });
    let result = await getOwnedConsole(context, { id });
    expect(
      kind === "IMAGE"
        ? result.detail.logo?.source
        : result.detail.modelFile?.source,
    ).toMatch(/copy's custom/);
    await mutateOwnedConsole(context, {
      ...mutation,
      expectedRevision: 3,
      useId: null,
    });
    result = await getOwnedConsole(context, { id });
    expect(
      kind === "IMAGE"
        ? result.detail.logo?.source
        : result.detail.modelFile?.source,
    ).toMatch(/Inherited platform/);
    await db.catalogAsset.create({
      data: {
        consoleModelId: model.id,
        assetId: (await catalogFile(kind)).id,
        role: kind === "IMAGE" ? "LOGO" : "MODEL_3D",
        isPrimary: true,
      },
    });
    result = await getOwnedConsole(context, { id });
    expect(
      kind === "IMAGE"
        ? result.detail.logo?.source
        : result.detail.modelFile?.source,
    ).toMatch(/Catalog model/);
    await mutateOwnedConsole(context, {
      operation: "removeOverride",
      id,
      expectedRevision: 4,
      useId: first.id,
    });
    expect(
      await db.asset.findUnique({ where: { id: assetId } }),
    ).not.toBeNull();
    expect(
      await db.catalogAsset.findUnique({ where: { id: catalogUse.id } }),
    ).not.toBeNull();
  },
);
it("rejects foreign overrides and ordinary photos, and advances no revision when clearing an absent override", async () => {
  const { id, request, context, input } = await existing();
  const sibling = await createConsole(context, { ...input, id: randomUUID() });
  const foreign = await override(sibling);
  await mutateOwnedConsole(context, {
    operation: "override",
    id,
    expectedRevision: 1,
    type: "CUSTOM_LOGO",
    useId: null,
  });
  for (const operation of ["override", "removeOverride"])
    await expect(
      mutateOwnedConsole(context, {
        operation,
        id,
        expectedRevision: 1,
        ...(operation === "override" ? { type: "CUSTOM_LOGO" } : {}),
        useId: foreign.id,
      }),
    ).rejects.toMatchObject({
      code: operation === "override" ? "INVALID_INPUT" : "NOT_FOUND",
    });
  const photo = await override(id);
  await db.collectionItemMedia.update({
    where: { id: photo.id },
    data: { type: "PHOTO" },
  });
  await expect(
    mutateOwnedConsole(context, {
      operation: "removeOverride",
      id,
      expectedRevision: 1,
      useId: photo.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await mutateOwnedConsole(context, {
    ...request,
    notes: "Revision remained 1",
  });
});
it("paginates saved overrides but always includes current primary selections", async () => {
  const { id, context } = await existing();
  const primary = await override(id);
  for (let i = 0; i < 26; i++) await override(id);
  await mutateOwnedConsole(context, {
    operation: "override",
    id,
    expectedRevision: 1,
    type: "CUSTOM_LOGO",
    useId: primary.id,
  });
  const first = await getOwnedConsole(context, { id });
  expect(first.detail.overrides).toHaveLength(25);
  expect(first.detail.moreOverrides).toBe(true);
  expect(first.detail.primaryOverrides).toMatchObject([{ id: primary.id }]);
  const second = await getOwnedConsole(context, { id, overridePage: 2 });
  expect(second.detail.overrides).toHaveLength(2);
  expect(second.detail.moreOverrides).toBe(false);
  await expect(
    getOwnedConsole(context, { id, overridePage: 1001 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("deletes only the selected root, subtype, defects and media links, preserving assets/catalog/siblings", async () => {
  const { id, input, context, model } = await existing();
  const sibling = await createConsole(context, { ...input, id: randomUUID() });
  const use = await override(id);
  await db.collectionItemMedia.create({
    data: {
      collectionItemId: sibling,
      assetId: use.assetId,
      type: "CUSTOM_LOGO",
    },
  });
  await db.catalogAsset.create({
    data: {
      consoleModelId: model.id,
      assetId: (await catalogFile()).id,
      role: "LOGO",
    },
  });
  await db.defect.create({
    data: { collectionItemId: id, title: "Scratch", severity: "COSMETIC" },
  });
  await mutateOwnedConsole(context, {
    operation: "delete",
    id,
    expectedRevision: 1,
  });
  expect(await db.collectionItem.findUnique({ where: { id } })).toBeNull();
  expect(
    await db.ownedConsole.findUnique({ where: { collectionItemId: id } }),
  ).toBeNull();
  expect(await db.defect.count({ where: { collectionItemId: id } })).toBe(0);
  expect(
    await db.collectionItemMedia.count({ where: { collectionItemId: id } }),
  ).toBe(0);
  expect(
    await db.collectionItemMedia.count({
      where: { collectionItemId: sibling },
    }),
  ).toBe(1);
  expect(await db.asset.count()).toBe(2);
  expect(await db.catalogAsset.count()).toBe(1);
  expect(await db.consoleModel.count()).toBe(1);
});
it("rolls back a failed update and a failed cascading delete", async () => {
  const { id, request, context } = await existing();
  const update = management.updateConsole;
  vi.spyOn(management, "updateConsole").mockImplementation(async (...args) => {
    await update(...args);
    throw new Error("persistence failed");
  });
  await expect(
    mutateOwnedConsole(context, { ...request, notes: "Must rollback" }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.collectionItem.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ revision: 1, notes: null });
  const use = await override(id);
  const remove = management.deleteConsole;
  vi.spyOn(management, "deleteConsole").mockImplementation(async (...args) => {
    await remove(...args);
    throw new Error("persistence failed");
  });
  await expect(
    mutateOwnedConsole(context, {
      operation: "delete",
      id,
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    await db.collectionItemMedia.findUnique({ where: { id: use.id } }),
  ).not.toBeNull();
  expect(
    await db.ownedConsole.findUnique({ where: { collectionItemId: id } }),
  ).not.toBeNull();
});

async function catalogFile(kind: "IMAGE" | "MODEL_3D" = "IMAGE") {
  return db.asset.create({
    data: {
      kind,
      scope: "CATALOG",
      state: "READY",
      deliveryClass: kind === "IMAGE" ? "DISPLAY" : "ORIGINAL",
      mimeType: kind === "IMAGE" ? "image/webp" : "model/gltf-binary",
      sizeBytes: 1,
      sha256: "b".repeat(64),
      ...(kind === "IMAGE" ? { width: 20, height: 20 } : {}),
      storageNamespace: "fixture",
      objectKey: randomUUID(),
    },
  });
}
it("rejects an open edit after a defect changes the shared aggregate revision", async () => {
  const { id, context, request } = await existing();
  await mutateDefect(context, {
    operation: "create",
    collectionItemId: id,
    expectedRevision: 1,
    title: "New issue",
    severity: "MINOR",
  });
  await expect(
    mutateOwnedConsole(context, { ...request, notes: "Stale edit" }),
  ).rejects.toMatchObject({ code: "COPY_STALE" });
  expect(await db.defect.count({ where: { collectionItemId: id } })).toBe(1);
});
it("names logo derivatives from their original file without exposing source provenance records", async () => {
  const { id, context } = await existing();
  const original = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      mimeType: "image/png",
      sizeBytes: 1,
      width: 20,
      height: 20,
      sha256: "c".repeat(64),
      originalFilename: "my-console-logo.png",
      storageNamespace: "fixture",
      objectKey: randomUUID(),
    },
  });
  const display = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "PENDING",
      deliveryClass: "DISPLAY",
      mimeType: "image/webp",
      sizeBytes: 1,
      width: 20,
      height: 20,
      sha256: "d".repeat(64),
      storageNamespace: "fixture",
      objectKey: randomUUID(),
    },
  });
  await db.assetDependency.create({
    data: {
      derivedAssetId: display.id,
      sourceAssetId: original.id,
      purpose: "RESIZE",
    },
  });
  await db.asset.update({
    where: { id: display.id },
    data: { state: "READY" },
  });
  const use = await db.collectionItemMedia.create({
    data: { collectionItemId: id, assetId: display.id, type: "CUSTOM_LOGO" },
  });
  const data = await getOwnedConsole(context, { id });
  expect(data.detail.overrides).toMatchObject([
    { id: use.id, name: "my-console-logo.png" },
  ]);
  expect(JSON.stringify(data)).not.toContain(original.id);
  expect(JSON.stringify(data)).not.toMatch(
    /sourceAsset|objectKey|storageNamespace/,
  );
});
