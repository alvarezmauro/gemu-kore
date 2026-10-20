import { randomUUID } from "node:crypto";
import type { Prisma } from "@/server/db/generated/client";
const fixtureJson = (value: Prisma.JsonValue): Prisma.InputJsonValue => {
  if (value === null) throw new Error("Fixture requires non-null JSON");
  return value;
};
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requirePrivateAccess } from "@/server/auth/access";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import type { AccessRole } from "@/features/auth/contracts";
import { signedSessionCookie } from "../helpers/access-session";
import { emptyCopyPhysical } from "@/features/collection/copy-validation";
import { createGameCopy } from "@/server/services/collection/games";

import { getOwnedGame } from "@/server/services/collection/game-management";
const db = getDatabase();
const secret = "game-creation-test-secret-longer-than-thirty-two-characters";
async function actor(role: AccessRole = "EDITOR") {
  const email = `${randomUUID()}@example.com`;
  const user = await db.user.create({
    data: { name: "Game fixture", email, emailVerified: true },
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
async function reset() {
  await db.$executeRaw`TRUNCATE TABLE packaging_template, asset, location, company, region, console_platform, game, collection_item, accessory CASCADE`;
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

import {
  createPackagingTemplate,
  changePackagingTemplate,
  assignPackaging,
  getPackagingManager,
} from "@/server/services/catalog/physical-editions";
import { getGamePackagingPresentation } from "@/server/services/collection/game-presentation";
import { fullArtwork, type BoxFamily } from "@/lib/three/packaging-contracts";
import { hasReferences, hasFamilyUses } from "@/server/repositories/assets";
async function setup(familyKey: BoxFamily = "snes-cardboard") {
  const admin = await actor("ADMIN");
  const platform = await db.consolePlatform.create({
    data: { name: "SNES", slug: randomUUID() },
  });
  const game = await db.game.create({
    data: { name: "Synthetic Box Test", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: randomUUID(),
      includedItems: {
        create: [
          { name: "Outer box", kind: "PACKAGING" },
          { name: "Inner box", kind: "PACKAGING" },
          { name: "Manual", kind: "MANUAL" },
        ],
      },
    },
    include: { includedItems: true },
  });
  const component = release.includedItems.find((c) => c.name === "Outer box")!;
  const copyId = await createGameCopy(admin.context, {
    ...emptyCopyPhysical,
    id: randomUUID(),
    platformId: platform.id,
    platformRevision: 1,
    gameId: game.id,
    gameRevision: 1,
    releaseId: release.id,
    releaseRevision: 1,
    hasBox: "yes",
  });
  const draft = {
    id: randomUUID(),
    name: "Synthetic SNES box",
    slug: randomUUID(),
    familyKey,
    revisionNumber: 1,
    dimensions: { schemaVersion: 1, widthMm: 180, heightMm: 125, depthMm: 30 },
    synthetic: true,
    measurementNote: "Synthetic dimensions, not retail measurements.",
  };
  await createPackagingTemplate(admin.context, draft);
  const promote = () =>
    changePackagingTemplate(admin.context, {
      id: draft.id,
      expectedRevision: 1,
      operation: "ready",
    });
  const original = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sha256: "b".repeat(64),
      width: 600,
      height: 400,
      sizeBytes: 500,
    },
  });
  const asset = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "PENDING",
      deliveryClass: "DISPLAY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/webp",
      sha256: "a".repeat(64),
      width: 600,
      height: 400,
      sizeBytes: 200,
      sourceType: "USER_UPLOAD",
      licenseName: "Synthetic fixture",
    },
  });
  await db.assetDependency.create({
    data: {
      sourceAssetId: original.id,
      derivedAssetId: asset.id,
      purpose: "RESIZE",
    },
  });
  await db.asset.update({ where: { id: asset.id }, data: { state: "READY" } });
  const manager = () =>
    getPackagingManager(admin.context, { releaseId: release.id });
  const view = (
    context = admin.context,
    componentId = component.id,
    expectedReleaseRevision = 2,
  ) =>
    getGamePackagingPresentation(context, {
      collectionItemId: copyId,
      componentId,
      expectedCopyRevision: 1,
      expectedReleaseRevision,
    });
  const input = async () => ({
    releaseId: release.id,
    componentId: component.id,
    expectedRevision: 1,
    templateId: draft.id,
    expectedTemplateRevision: 2,
    bindings: (await manager()).templates
      .find((t) => t.id === draft.id)!
      .slots.filter((s) => s.required)
      .map((s) => ({
        slotId: s.id,
        assetId: asset.id,
        transform: fullArtwork,
      })),
  });
  return {
    admin,
    platform,
    release,
    component,
    copyId,
    draft,
    promote,
    asset,
    manager,
    view,
    input,
  };
}
it("promotes a six-face immutable draft, assigns artwork atomically, and reads a bounded private descriptor without changing copy presence", async () => {
  const c = await setup();
  await c.promote();
  const input = await c.input();
  await assignPackaging(c.admin.context, input);
  await assignPackaging(c.admin.context, input);
  expect(
    (await db.gameRelease.findUniqueOrThrow({ where: { id: c.release.id } }))
      .revision,
  ).toBe(2);
  expect(
    await db.metadataChange.count({
      where: {
        gameReleaseId: c.release.id,
        fieldPath: `physicalPresentation.${c.component.id}`,
      },
    }),
  ).toBe(1);
  const viewer = await actor("VIEWER"),
    result = await c.view(viewer.context);
  expect(result.content).toMatchObject({
    synthetic: true,
    artworkComplete: true,
    dimensions: c.draft.dimensions,
  });
  expect(result.content.slots.filter((s) => s.resource)).toHaveLength(3);
  expect(JSON.stringify(result)).not.toMatch(
    /objectKey|storageNamespace|measurementNote|createdById/,
  );
  const detail = await getOwnedGame(viewer.context, { id: c.copyId });
  expect(detail.packaging.find((p) => p.id === c.component.id)).toMatchObject({
    available: true,
    artworkComplete: true,
  });
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: c.copyId } }))
      .hasBox,
  ).toBe(true);
  await expect(
    db.packagingTemplate.update({
      where: { id: c.draft.id },
      data: {
        dimensions: {
          schemaVersion: 1,
          widthMm: 10,
          heightMm: 10,
          depthMm: 10,
        },
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.packagingTextureSlot.delete({ where: { id: input.bindings[0].slotId } }),
  ).rejects.toThrow();
  await expect(
    db.gameReleaseIncludedItem.update({
      where: { id: c.component.id },
      data: { kind: "MANUAL" },
    }),
  ).rejects.toThrow();
  await changePackagingTemplate(c.admin.context, {
    id: c.draft.id,
    expectedRevision: 2,
    operation: "archive",
  });
  expect((await c.view()).content.artworkComplete).toBe(true);
});
it("denies stale, cross-release and revoked reads, and prevents nonadministrators from curating", async () => {
  const c = await setup();
  await c.promote();
  await assignPackaging(c.admin.context, await c.input());
  const viewer = await actor("VIEWER");
  await expect(c.view(viewer.context, randomUUID())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(c.view(viewer.context, c.component.id, 1)).rejects.toMatchObject(
    { code: "STALE" },
  );
  await expect(
    assignPackaging(viewer.context, { ...(await c.input()), bindings: [] }),
  ).rejects.toThrow();
  await db.accessGrant.update({
    where: { id: viewer.grant.id },
    data: { enabled: false },
  });
  await expect(c.view(viewer.context)).rejects.toThrow();
  await expect(
    assignPackaging(c.admin.context, { ...(await c.input()), bindings: [] }),
  ).rejects.toMatchObject({ code: "STALE" });
});
it("rejects draft, wrong-kind and ineligible artwork assignments; same-template foreign keys and cleanup references protect retained artwork", async () => {
  const c = await setup(),
    input = await c.input();
  await expect(assignPackaging(c.admin.context, input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await c.promote();
  await expect(
    assignPackaging(c.admin.context, {
      ...input,
      componentId: c.release.includedItems.find((c) => c.kind === "MANUAL")!.id,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const privateArt = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "COLLECTION",
      state: "READY",
      deliveryClass: "DISPLAY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sha256: "c".repeat(64),
      sizeBytes: 200,
      width: 600,
      height: 400,
    },
  });
  await expect(
    assignPackaging(c.admin.context, {
      ...input,
      bindings: input.bindings.map((b) => ({ ...b, assetId: privateArt.id })),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await assignPackaging(c.admin.context, input);
  expect(await db.$transaction((tx) => hasReferences(c.asset.id, tx))).toBe(
    true,
  );
  expect(await db.$transaction((tx) => hasFamilyUses(c.asset.id, tx))).toBe(
    true,
  );
  await expect(
    db.packagingTextureBinding.updateMany({
      where: { includedItemId: c.component.id },
      data: { packagingTemplateId: randomUUID() },
    }),
  ).rejects.toThrow();
  const other = c.release.includedItems.find((x) => x.name === "Inner box")!;
  await assignPackaging(c.admin.context, {
    ...input,
    componentId: other.id,
    expectedRevision: 2,
    bindings: [],
  });
  const second = await c.view(c.admin.context, other.id, 3);
  expect(second.content.templateId).toBe(c.draft.id);
  expect(second.content.artworkComplete).toBe(false);
  const first = await c.view(c.admin.context, c.component.id, 3);
  expect(first.content.artworkComplete).toBe(true);
  await assignPackaging(c.admin.context, {
    ...input,
    expectedRevision: 3,
    templateId: null,
    expectedTemplateRevision: null,
    bindings: [],
  });
  expect(
    await db.packagingTextureBinding.count({
      where: { includedItemId: c.component.id },
    }),
  ).toBe(0);
});
it("preserves assigned packaging in ordinary catalog edits and blocks accidental component removal", async () => {
  const c = await setup();
  await c.promote();
  await assignPackaging(c.admin.context, await c.input());
  const { getGameCatalog, saveGameCatalog } =
    await import("@/server/services/catalog/games");
  const selected = (
    await getGameCatalog(c.admin.context, { kind: "release", id: c.release.id })
  ).selected!;
  if (selected.kind !== "release") throw Error("Expected release");
  const update = {
    kind: "release",
    id: c.release.id,
    expectedRevision: selected.revision,
    references: [],
    fields: { ...selected.fields, editionName: "Curated edition" },
  };
  await saveGameCatalog(c.admin.context, update);
  expect(
    (
      await db.gameReleaseIncludedItem.findUniqueOrThrow({
        where: { id: c.component.id },
      })
    ).packagingTemplateId,
  ).toBe(c.draft.id);
  expect(
    await db.packagingTextureBinding.count({
      where: { includedItemId: c.component.id },
    }),
  ).toBe(3);
  await expect(
    saveGameCatalog(c.admin.context, {
      ...update,
      expectedRevision: 3,
      fields: {
        ...update.fields,
        includedItems: update.fields.includedItems.filter(
          (i) => i.id !== c.component.id,
        ),
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("adds a separately versioned NES family without changing ready SNES contracts or inferring a format from the platform", async () => {
  const c = await setup();
  await c.promote();
  await assignPackaging(c.admin.context, await c.input());
  const inner = c.release.includedItems.find(
    (item) => item.name === "Inner box",
  )!;
  const before = await db.packagingTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
    include: { slots: { orderBy: { name: "asc" } } },
  });
  const nes = {
    ...c.draft,
    id: randomUUID(),
    slug: randomUUID(),
    familyKey: "nes-cardboard",
    name: "Synthetic NES market variant",
    dimensions: { schemaVersion: 1, widthMm: 110, heightMm: 160, depthMm: 25 },
  };
  await createPackagingTemplate(c.admin.context, nes);
  await createPackagingTemplate(c.admin.context, nes);
  await changePackagingTemplate(c.admin.context, {
    id: nes.id,
    expectedRevision: 1,
    operation: "ready",
  });
  const manager = await c.manager(),
    template = manager.templates.find((t) => t.id === nes.id)!;
  expect(manager.templates.map((t) => [t.familyKey, t.revisionNumber])).toEqual(
    expect.arrayContaining([
      ["nes-cardboard", 1],
      ["snes-cardboard", 1],
    ]),
  );
  await expect(
    createPackagingTemplate(c.admin.context, {
      ...nes,
      familyKey: "snes-cardboard",
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  const old = {
    ...(await c.input()),
    componentId: inner.id,
    expectedRevision: 2,
  };
  await expect(
    assignPackaging(c.admin.context, { ...old, templateId: nes.id }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    (await db.gameRelease.findUniqueOrThrow({ where: { id: c.release.id } }))
      .revision,
  ).toBe(2);
  await assignPackaging(c.admin.context, {
    ...old,
    templateId: nes.id,
    bindings: template.slots
      .filter((s) => s.required)
      .map((s) => ({
        slotId: s.id,
        assetId: c.asset.id,
        transform: fullArtwork,
      })),
  });
  const result = await c.view(c.admin.context, inner.id, 3);
  expect(
    (await c.view(c.admin.context, c.component.id, 3)).content,
  ).toMatchObject({ familyKey: "snes-cardboard", artworkComplete: true });
  expect(result.content).toMatchObject({
    familyKey: "nes-cardboard",
    dimensions: nes.dimensions,
    artworkComplete: true,
  });
  expect(
    (await getOwnedGame(c.admin.context, { id: c.copyId })).packaging.find(
      (p) => p.id === inner.id,
    ),
  ).toMatchObject({ familyKey: "nes-cardboard", available: true });
  const after = await db.packagingTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
    include: { slots: { orderBy: { name: "asc" } } },
  });
  expect(after).toEqual(before);
  await expect(
    db.packagingTemplate.update({
      where: { id: c.draft.id },
      data: { familyKey: "nes-cardboard", revisionNumber: 2 },
    }),
  ).rejects.toThrow();
  const editor = await actor("EDITOR");
  await expect(
    createPackagingTemplate(editor.context, {
      ...nes,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 2,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const { id, ...unsupported } = before;
  void id;
  await expect(
    db.packagingTemplate.create({
      data: {
        ...unsupported,
        dimensions: fixtureJson(unsupported.dimensions),
        materialSettings: fixtureJson(unsupported.materialSettings),
        cameraSettings: fixtureJson(unsupported.cameraSettings),
        metadata: fixtureJson(unsupported.metadata),
        id: randomUUID(),
        slug: randomUUID(),
        familyKey: "genesis-clamshell",
        slots: undefined,
        status: "DRAFT",
      },
    }),
  ).rejects.toThrow();
});
it("bounds template choices per family so many NES revisions cannot hide SNES or a retained assignment", async () => {
  const c = await setup("nes-cardboard");
  await c.promote();
  await assignPackaging(c.admin.context, await c.input());
  const base = await db.packagingTemplate.findUniqueOrThrow({
      where: { id: c.draft.id },
    }),
    slots = await db.packagingTextureSlot.findMany({
      where: { packagingTemplateId: c.draft.id },
    });
  const ids = Array.from({ length: 51 }, () => randomUUID());
  await db.packagingTemplate.createMany({
    data: ids.map((id, i) => ({
      ...base,
      dimensions: fixtureJson(base.dimensions),
      materialSettings: fixtureJson(base.materialSettings),
      cameraSettings: fixtureJson(base.cameraSettings),
      metadata: fixtureJson(base.metadata),
      id,
      slug: randomUUID(),
      revisionNumber: i + 2,
      status: "DRAFT" as const,
    })),
  });
  await db.packagingTextureSlot.createMany({
    data: ids.flatMap((id) =>
      slots.map((s) => ({
        ...s,
        target: fixtureJson(s.target),
        id: randomUUID(),
        packagingTemplateId: id,
      })),
    ),
  });
  const snes = {
    ...c.draft,
    id: randomUUID(),
    slug: randomUUID(),
    familyKey: "snes-cardboard",
  };
  await createPackagingTemplate(c.admin.context, snes);
  const manager = await c.manager();
  expect(manager.moreTemplates).toBe(true);
  expect(
    manager.templates.filter((t) => t.familyKey === "nes-cardboard"),
  ).toHaveLength(51);
  expect(manager.templates.find((t) => t.id === snes.id)).toMatchObject({
    familyKey: "snes-cardboard",
    revisionNumber: 1,
  });
  expect(manager.templates.find((t) => t.id === c.draft.id)).toMatchObject({
    familyKey: "nes-cardboard",
    status: "READY",
  });
});
import { jewelFixture } from "../helpers/jewel-fixture";
import { clamshellFixture } from "../helpers/clamshell-fixture";
it("keeps jewel, Genesis and cardboard contracts separate while binding both jewel spines explicitly", async () => {
  const c = await setup();
  await c.promote();
  const retained = await db.packagingTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
    include: { slots: { orderBy: { name: "asc" } } },
  });
  const f = jewelFixture(),
    jewel = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      name: "Synthetic jewel case",
      familyKey: "playstation-jewel",
      dimensions: f.dimensions,
      slots: f.slots,
    };
  const gen = clamshellFixture(),
    genesis = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      name: "Synthetic clamshell",
      familyKey: "genesis-clamshell",
      dimensions: gen.dimensions,
      slots: gen.slots,
    };
  await createPackagingTemplate(c.admin.context, jewel);
  await createPackagingTemplate(c.admin.context, jewel);
  await createPackagingTemplate(c.admin.context, genesis);
  const model = await db.asset.create({
    data: {
      kind: "MODEL_3D",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "model/gltf-binary",
      sha256: "d".repeat(64),
      sizeBytes: f.bytes.length,
    },
  });
  // Exercise database readiness guards here. Real-byte approval is covered by MinIO tests.
  await expect(
    db.packagingTemplate.update({
      where: { id: jewel.id },
      data: { status: "READY" },
    }),
  ).rejects.toThrow();
  await db.packagingTemplate.update({
    where: { id: jewel.id },
    data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
  });
  const manager = await c.manager(),
    t = manager.templates.find((t) => t.id === jewel.id)!;
  expect(t.slots).toHaveLength(4);
  expect(
    t.slots
      .filter((s) => s.required)
      .map((s) => s.name)
      .sort(),
  ).toEqual(["BACK", "FRONT", "SPINE"]);
  const input = {
    releaseId: c.release.id,
    componentId: c.component.id,
    expectedRevision: 1,
    templateId: jewel.id,
    expectedTemplateRevision: 2,
    bindings: [] as {
      slotId: string;
      assetId: string;
      transform: typeof fullArtwork;
    }[],
  };
  await assignPackaging(c.admin.context, input);
  expect((await c.view()).content).toMatchObject({
    familyKey: "playstation-jewel",
    rendererVersion: "gltf-slots-v1",
    artworkComplete: false,
    geometry: { id: model.id },
  });
  input.expectedRevision = 2;
  input.bindings = t.slots
    .filter((s) => s.required)
    .map((s) => ({
      slotId: s.id,
      assetId: c.asset.id,
      transform: fullArtwork,
    }));
  await assignPackaging(c.admin.context, input);
  const complete = await c.view(c.admin.context, c.component.id, 3);
  expect(complete.content.artworkComplete).toBe(true);
  if (complete.content.rendererVersion !== "gltf-slots-v1")
    throw new Error("Expected authored presentation");
  expect(
    complete.content.slots.find((s) => s.name === "OPPOSITE_SPINE"),
  ).toMatchObject({ required: false, resource: null });
  input.expectedRevision = 3;
  input.bindings = t.slots.map((s) => ({
    slotId: s.id,
    assetId: c.asset.id,
    transform: fullArtwork,
  }));
  await assignPackaging(c.admin.context, input);
  const both = await c.view(c.admin.context, c.component.id, 4);
  expect(both.content.slots.filter((s) => s.resource)).toHaveLength(4);
  await expect(
    assignPackaging(c.admin.context, {
      ...input,
      expectedRevision: 4,
      bindings: [
        {
          slotId: retained.slots[0].id,
          assetId: c.asset.id,
          transform: fullArtwork,
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    db.packagingTemplate.update({
      where: { id: jewel.id },
      data: { familyKey: "genesis-clamshell" },
    }),
  ).rejects.toThrow();
  await expect(
    db.packagingTextureSlot.update({
      where: { id: t.slots.find((s) => s.name === "OPPOSITE_SPINE")!.id },
      data: { required: true },
    }),
  ).rejects.toThrow();
  expect(
    await db.packagingTemplate.findUnique({
      where: { id: c.draft.id },
      include: { slots: { orderBy: { name: "asc" } } },
    }),
  ).toEqual(retained);
  expect(await hasReferences(model.id, db)).toBe(true);
  await expect(
    db.asset.update({ where: { id: model.id }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
});
it("refuses opposite-spine slots on Genesis and refuses an incomplete jewel slot contract at readiness", async () => {
  const c = await setup(),
    f = jewelFixture(),
    input = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      name: "Synthetic jewel",
      familyKey: "playstation-jewel",
      dimensions: f.dimensions,
      slots: f.slots,
    };
  await createPackagingTemplate(c.admin.context, input);
  await db.packagingTextureSlot.deleteMany({
    where: { packagingTemplateId: input.id, name: "OPPOSITE_SPINE" },
  });
  const model = await db.asset.create({
    data: {
      kind: "MODEL_3D",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "model/gltf-binary",
      sha256: "d".repeat(64),
      sizeBytes: f.bytes.length,
    },
  });
  await expect(
    db.packagingTemplate.update({
      where: { id: input.id },
      data: { baseModelAssetId: model.id, status: "READY" },
    }),
  ).rejects.toThrow();
  const gen = clamshellFixture(),
    genesis = {
      ...input,
      id: randomUUID(),
      slug: randomUUID(),
      familyKey: "genesis-clamshell",
      dimensions: gen.dimensions,
      slots: gen.slots,
    };
  await createPackagingTemplate(c.admin.context, genesis);
  const s = f.slots[3];
  await expect(
    db.packagingTextureSlot.create({
      data: {
        packagingTemplateId: genesis.id,
        name: s.name,
        required: false,
        materialName: s.target.materialName,
        target: s.target,
      },
    }),
  ).rejects.toThrow();
});
import { dvdFixture } from "../helpers/dvd-fixture";
it("curates independent PS2 revisions, preserves existing formats and enforces DVD bindings and cleanup", async () => {
  const c = await setup();
  await c.promote();
  const retained = await db.packagingTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
    include: { slots: { orderBy: { name: "asc" } } },
  });
  const f = dvdFixture(),
    dvd = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      name: "Synthetic PS2 DVD case",
      familyKey: "ps2-dvd",
      dimensions: f.dimensions,
      slots: f.slots,
    };
  await createPackagingTemplate(c.admin.context, dvd);
  await createPackagingTemplate(c.admin.context, dvd);
  const manager = await c.manager(),
    t = manager.templates.find((t) => t.id === dvd.id)!;
  expect(t.slots).toHaveLength(3);
  expect(t.slots.every((s) => s.required)).toBe(true);
  const opposite = jewelFixture().slots[3];
  await expect(
    db.packagingTextureSlot.create({
      data: {
        packagingTemplateId: dvd.id,
        name: opposite.name,
        required: false,
        materialName: opposite.target.materialName,
        target: opposite.target,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.packagingTemplate.update({
      where: { id: dvd.id },
      data: { status: "READY" },
    }),
  ).rejects.toThrow();
  const model = await db.asset.create({
    data: {
      kind: "MODEL_3D",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "model/gltf-binary",
      sha256: "e".repeat(64),
      sizeBytes: f.bytes.length,
    },
  });
  // Database guards here; actual stored GLB approval is covered by MinIO checks.
  await db.packagingTemplate.update({
    where: { id: dvd.id },
    data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
  });
  const input = {
    releaseId: c.release.id,
    componentId: c.component.id,
    expectedRevision: 1,
    templateId: dvd.id,
    expectedTemplateRevision: 2,
    bindings: [] as {
      slotId: string;
      assetId: string;
      transform: typeof fullArtwork;
    }[],
  };
  await assignPackaging(c.admin.context, input);
  expect((await c.view()).content).toMatchObject({
    familyKey: "ps2-dvd",
    rendererVersion: "gltf-slots-v1",
    artworkComplete: false,
    geometry: { id: model.id },
  });
  input.expectedRevision = 2;
  input.bindings = t.slots.map((s) => ({
    slotId: s.id,
    assetId: c.asset.id,
    transform: fullArtwork,
  }));
  await assignPackaging(c.admin.context, input);
  const result = await c.view(c.admin.context, c.component.id, 3);
  expect(result.content).toMatchObject({
    familyKey: "ps2-dvd",
    artworkComplete: true,
    dimensions: f.dimensions,
  });
  expect(result.content.slots.filter((s) => s.resource)).toHaveLength(3);
  await expect(
    assignPackaging(c.admin.context, {
      ...input,
      expectedRevision: 3,
      bindings: [
        {
          slotId: retained.slots[0].id,
          assetId: c.asset.id,
          transform: fullArtwork,
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({
      where: { id: c.draft.id },
      include: { slots: { orderBy: { name: "asc" } } },
    }),
  ).toEqual(retained);
  await expect(
    db.packagingTemplate.update({
      where: { id: dvd.id },
      data: { familyKey: "genesis-clamshell" },
    }),
  ).rejects.toThrow();
  expect(await hasReferences(model.id, db)).toBe(true);
  await expect(
    db.asset.update({ where: { id: model.id }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
  const editor = await actor("EDITOR");
  await expect(
    createPackagingTemplate(editor.context, {
      ...dvd,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 2,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

import { switchFixture } from "../helpers/switch-fixture";
it("curates independent Switch revisions, preserves existing formats and enforces Switch bindings and cleanup", async () => {
  const c = await setup();
  await c.promote();
  const retained = await db.packagingTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
    include: { slots: { orderBy: { name: "asc" } } },
  });
  const f = switchFixture(),
    switchCase = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      name: "Synthetic Switch case",
      familyKey: "switch-case",
      dimensions: f.dimensions,
      slots: f.slots,
    };
  await createPackagingTemplate(c.admin.context, switchCase);
  await createPackagingTemplate(c.admin.context, switchCase);
  const manager = await c.manager(),
    t = manager.templates.find((t) => t.id === switchCase.id)!;
  expect(t.slots).toHaveLength(3);
  expect(t.slots.every((s) => s.required)).toBe(true);
  const opposite = jewelFixture().slots[3];
  await expect(
    db.packagingTextureSlot.create({
      data: {
        packagingTemplateId: switchCase.id,
        name: opposite.name,
        required: false,
        materialName: opposite.target.materialName,
        target: opposite.target,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.packagingTemplate.update({
      where: { id: switchCase.id },
      data: { status: "READY" },
    }),
  ).rejects.toThrow();
  const model = await db.asset.create({
    data: {
      kind: "MODEL_3D",
      scope: "CATALOG",
      state: "READY",
      deliveryClass: "ORIGINAL",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "model/gltf-binary",
      sha256: "e".repeat(64),
      sizeBytes: f.bytes.length,
    },
  });
  // Database guards here; actual stored GLB approval is covered by MinIO checks.
  await db.packagingTemplate.update({
    where: { id: switchCase.id },
    data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
  });
  const input = {
    releaseId: c.release.id,
    componentId: c.component.id,
    expectedRevision: 1,
    templateId: switchCase.id,
    expectedTemplateRevision: 2,
    bindings: [] as {
      slotId: string;
      assetId: string;
      transform: typeof fullArtwork;
    }[],
  };
  await assignPackaging(c.admin.context, input);
  expect((await c.view()).content).toMatchObject({
    familyKey: "switch-case",
    rendererVersion: "gltf-slots-v1",
    artworkComplete: false,
    geometry: { id: model.id },
  });
  input.expectedRevision = 2;
  input.bindings = t.slots.map((s) => ({
    slotId: s.id,
    assetId: c.asset.id,
    transform: fullArtwork,
  }));
  await assignPackaging(c.admin.context, input);
  const result = await c.view(c.admin.context, c.component.id, 3);
  expect(result.content).toMatchObject({
    familyKey: "switch-case",
    artworkComplete: true,
    dimensions: f.dimensions,
  });
  expect(result.content.slots.filter((s) => s.resource)).toHaveLength(3);
  await expect(
    assignPackaging(c.admin.context, {
      ...input,
      expectedRevision: 3,
      bindings: [
        {
          slotId: retained.slots[0].id,
          assetId: c.asset.id,
          transform: fullArtwork,
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({
      where: { id: c.draft.id },
      include: { slots: { orderBy: { name: "asc" } } },
    }),
  ).toEqual(retained);
  await expect(
    db.packagingTemplate.update({
      where: { id: switchCase.id },
      data: { familyKey: "genesis-clamshell" },
    }),
  ).rejects.toThrow();
  expect(await hasReferences(model.id, db)).toBe(true);
  await expect(
    db.asset.update({ where: { id: model.id }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
  const editor = await actor("EDITOR");
  await expect(
    createPackagingTemplate(editor.context, {
      ...switchCase,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 2,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
