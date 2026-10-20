import { randomUUID } from "node:crypto";
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

import { cartridgeFixture } from "../helpers/cartridge-fixture";
import {
  createPhysicalMediaTemplate,
  changePhysicalMediaTemplate,
  assignPhysicalMedia,
  getMediaManager,
} from "@/server/services/catalog/physical-media";
import { getGameCartridgePresentation } from "@/server/services/collection/media-presentation";
import { fullArtwork } from "@/lib/three/packaging-contracts";
import { hasReferences, hasFamilyUses } from "@/server/repositories/assets";
async function setup(shared?: {
  id: string;
  name: string;
  slug: string;
  familyKey: string;
  type: string;
  revisionNumber: number;
  dimensions: ReturnType<typeof cartridgeFixture>["dimensions"];
  slots: ReturnType<typeof cartridgeFixture>["slots"];
  synthetic: boolean;
  measurementNote: string;
}) {
  const admin = await actor("ADMIN"),
    f = cartridgeFixture();
  const platform = await db.consolePlatform.create({
    data: { name: "Synthetic platform", slug: randomUUID() },
  });
  const game = await db.game.create({
    data: { name: "Synthetic cartridge test", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: {
      gameId: game.id,
      platformId: platform.id,
      slug: randomUUID(),
      includedItems: {
        create: [
          { name: "Cartridge", kind: "MEDIA" },
          { name: "Second media", kind: "MEDIA" },
          { name: "Box", kind: "PACKAGING" },
        ],
      },
    },
    include: { includedItems: true },
  });
  const component = release.includedItems.find((c) => c.name === "Cartridge")!;
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
  const draft = shared ?? {
    id: randomUUID(),
    name: "Original synthetic cartridge",
    slug: randomUUID(),
    familyKey: "cartridge",
    type: "CARTRIDGE",
    revisionNumber: 1,
    dimensions: f.dimensions,
    slots: f.slots,
    synthetic: true,
    measurementNote: "Original synthetic dimensions, not retail measurements",
  };
  await createPhysicalMediaTemplate(admin.context, draft);
  const original = await db.asset.create({
    data: {
      kind: "IMAGE",
      scope: "CATALOG",
      state: "READY",
      storageNamespace: "test",
      objectKey: randomUUID(),
      mimeType: "image/png",
      sha256: "b".repeat(64),
      sizeBytes: 500,
      width: 600,
      height: 400,
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
      sizeBytes: 200,
      width: 600,
      height: 400,
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
    getMediaManager(admin.context, { releaseId: release.id });
  // Database guards only here; stored-byte review is exercised against MinIO.
  const promote = async () => {
    const model = await db.asset.create({
      data: {
        kind: "MODEL_3D",
        scope: "CATALOG",
        state: "READY",
        storageNamespace: "test",
        objectKey: randomUUID(),
        mimeType: "model/gltf-binary",
        sha256: "c".repeat(64),
        sizeBytes: f.bytes.length,
      },
    });
    await db.physicalMediaTemplate.update({
      where: { id: draft.id },
      data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
    });
    return model;
  };
  const input = async () => ({
    releaseId: release.id,
    componentId: component.id,
    expectedRevision: 1,
    templateId: draft.id,
    expectedTemplateRevision: 2,
    bindings: (await manager()).templates
      .find((t) => t.id === draft.id)!
      .slots.map((s) => ({
        slotId: s.id,
        assetId: asset.id,
        transform: fullArtwork,
      })),
  });
  const view = (
    context = admin.context,
    componentId = component.id,
    expectedReleaseRevision = 2,
  ) =>
    getGameCartridgePresentation(context, {
      collectionItemId: copyId,
      componentId,
      expectedCopyRevision: 1,
      expectedReleaseRevision,
    });
  return {
    admin,
    release,
    component,
    copyId,
    draft,
    asset,
    original,
    manager,
    promote,
    input,
    view,
  };
}
it("creates an idempotent cartridge draft and refuses unsupported types, slots and unreviewed readiness", async () => {
  const c = await setup();
  await createPhysicalMediaTemplate(c.admin.context, c.draft);
  await expect(
    createPhysicalMediaTemplate(c.admin.context, {
      ...c.draft,
      name: "Conflicting retry",
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  await expect(
    changePhysicalMediaTemplate(c.admin.context, {
      id: c.draft.id,
      expectedRevision: 1,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    db.physicalMediaTemplate.update({
      where: { id: c.draft.id },
      data: { status: "READY" },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTemplate.update({
      where: { id: c.draft.id },
      data: { type: "DISC" },
    }),
  ).rejects.toThrow();
  const slot = (await c.manager()).templates[0].slots[0];
  await expect(
    db.physicalMediaTextureSlot.update({
      where: { id: slot.id },
      data: { required: false },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTextureSlot.update({
      where: { id: slot.id },
      data: { name: "DISC_ART" },
    }),
  ).rejects.toThrow();
  await expect(
    db.gameReleaseIncludedItem.update({
      where: { id: c.component.id },
      data: { physicalMediaTemplateId: c.draft.id },
    }),
  ).rejects.toThrow();
});
it("assembles neutral and textured media, retries atomically and preserves manual presence", async () => {
  const c = await setup();
  await c.promote();
  const input = await c.input();
  await assignPhysicalMedia(c.admin.context, { ...input, bindings: [] });
  expect((await c.view()).content).toMatchObject({
    kind: "PHYSICAL_MEDIA",
    artworkComplete: false,
    rendererVersion: "cartridge-v1",
  });
  await assignPhysicalMedia(c.admin.context, { ...input, expectedRevision: 2 });
  await assignPhysicalMedia(c.admin.context, { ...input, expectedRevision: 2 });
  const result = await c.view(c.admin.context, c.component.id, 3);
  expect(result.content.artworkComplete).toBe(true);
  expect(result.content.slots[0].resource?.id).toBe(c.asset.id);
  expect(JSON.stringify(result)).not.toMatch(
    /objectKey|storageNamespace|measurementNote|createdById/,
  );
  expect(
    (await getOwnedGame(c.admin.context, { id: c.copyId })).media.find(
      (c) => c.id === input.componentId,
    ),
  ).toMatchObject({ available: true, artworkComplete: true });
  expect(
    (await db.collectionItem.findUniqueOrThrow({ where: { id: c.copyId } }))
      .hasBox,
  ).toBe(true);
  expect(
    await db.metadataChange.count({
      where: {
        gameReleaseId: c.release.id,
        fieldPath: `physicalMediaPresentation.${c.component.id}`,
      },
    }),
  ).toBe(2);
});
it("isolates labels when two releases share the same cartridge geometry", async () => {
  const c = await setup(),
    model = await c.promote(),
    d = await setup(c.draft);
  await assignPhysicalMedia(c.admin.context, await c.input());
  await assignPhysicalMedia(d.admin.context, await d.input());
  const a = await c.view(),
    b = await d.view();
  expect(a.content.geometry.id).toBe(model.id);
  expect(b.content.geometry.id).toBe(model.id);
  expect(a.content.slots[0].resource?.id).not.toBe(
    b.content.slots[0].resource?.id,
  );
  expect(a.presentationKey).not.toBe(b.presentationKey);
});
it("enforces exact component/template/slot identities and rejects stale or invalid artwork saves", async () => {
  const c = await setup();
  await c.promote();
  const input = await c.input();
  await expect(
    assignPhysicalMedia(c.admin.context, {
      ...input,
      componentId: c.release.includedItems.find((c) => c.kind === "PACKAGING")!
        .id,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    assignPhysicalMedia(c.admin.context, {
      ...input,
      bindings: [{ ...input.bindings[0], slotId: randomUUID() }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    assignPhysicalMedia(c.admin.context, {
      ...input,
      bindings: [{ ...input.bindings[0], assetId: c.original.id }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    assignPhysicalMedia(c.admin.context, {
      ...input,
      bindings: [
        {
          ...input.bindings[0],
          transform: {
            ...fullArtwork,
            crop: { x: 0.8, y: 0, width: 1, height: 1 },
          },
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await assignPhysicalMedia(c.admin.context, input);
  await expect(
    assignPhysicalMedia(c.admin.context, { ...input, bindings: [] }),
  ).rejects.toMatchObject({ code: "STALE" });
  await expect(
    db.physicalMediaTextureBinding.updateMany({
      where: { includedItemId: c.component.id },
      data: { physicalMediaTemplateId: randomUUID() },
    }),
  ).rejects.toThrow();
  await expect(c.view(c.admin.context, randomUUID())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    c.view(c.admin.context, c.component.id, 1),
  ).rejects.toMatchObject({ code: "STALE" });
});
it("freezes ready models and mappings, retains archived previews and requires explicit detach", async () => {
  const c = await setup(),
    model = await c.promote(),
    input = await c.input();
  await assignPhysicalMedia(c.admin.context, input);
  await expect(
    db.physicalMediaTemplate.update({
      where: { id: c.draft.id },
      data: { baseModelAssetId: null },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTemplate.update({
      where: { id: c.draft.id },
      data: { dimensions: { ...c.draft.dimensions, widthMm: 90 } },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTextureSlot.delete({
      where: { id: input.bindings[0].slotId },
    }),
  ).rejects.toThrow();
  await expect(
    db.gameReleaseIncludedItem.update({
      where: { id: c.component.id },
      data: { kind: "MANUAL" },
    }),
  ).rejects.toThrow();
  await changePhysicalMediaTemplate(c.admin.context, {
    id: c.draft.id,
    expectedRevision: 2,
    operation: "archive",
  });
  expect((await c.view()).content.artworkComplete).toBe(true);
  await expect(
    assignPhysicalMedia(c.admin.context, {
      ...input,
      componentId: c.release.includedItems.find(
        (c) => c.name === "Second media",
      )!.id,
      expectedRevision: 2,
      expectedTemplateRevision: 3,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(await hasReferences(model.id, db)).toBe(true);
  expect(await hasReferences(c.asset.id, db)).toBe(true);
  expect(await hasFamilyUses(c.asset.id, db)).toBe(true);
  await expect(
    db.asset.update({ where: { id: model.id }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
  await expect(
    db.asset.update({ where: { id: c.asset.id }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
  await assignPhysicalMedia(c.admin.context, {
    ...input,
    expectedRevision: 2,
    templateId: null,
    expectedTemplateRevision: null,
    bindings: [],
  });
  expect(await db.physicalMediaTextureBinding.count()).toBe(0);
});
it("reauthorizes current roles for reads and curation", async () => {
  const c = await setup();
  await c.promote();
  await assignPhysicalMedia(c.admin.context, await c.input());
  const viewer = await actor("VIEWER");
  expect((await c.view(viewer.context)).content.artworkComplete).toBe(true);
  await expect(
    assignPhysicalMedia(viewer.context, { ...(await c.input()), bindings: [] }),
  ).rejects.toThrow();
  await expect(
    createPhysicalMediaTemplate(viewer.context, {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 2,
    }),
  ).rejects.toThrow();
  await db.accessGrant.update({
    where: { id: viewer.grant.id },
    data: { enabled: false },
  });
  await expect(c.view(viewer.context)).rejects.toThrow();
});
it("preserves media assignments in ordinary catalog edits and blocks accidental removal", async () => {
  const c = await setup();
  await c.promote();
  await assignPhysicalMedia(c.admin.context, await c.input());
  const { getGameCatalog, saveGameCatalog } =
    await import("@/server/services/catalog/games");
  const selected = (
    await getGameCatalog(c.admin.context, { kind: "release", id: c.release.id })
  ).selected!;
  if (selected.kind !== "release") throw new Error("Expected release");
  const update = {
    kind: "release",
    id: c.release.id,
    expectedRevision: selected.revision,
    references: [],
    fields: { ...selected.fields, editionName: "Reviewed edition" },
  };
  await saveGameCatalog(c.admin.context, update);
  expect(
    (
      await db.gameReleaseIncludedItem.findUniqueOrThrow({
        where: { id: c.component.id },
      })
    ).physicalMediaTemplateId,
  ).toBe(c.draft.id);
  await expect(
    saveGameCatalog(c.admin.context, {
      ...update,
      expectedRevision: 3,
      fields: {
        ...update.fields,
        includedItems: selected.fields.includedItems.filter(
          (item) => item.id !== c.component.id,
        ),
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("rejects valid foreign slots, duplicate labels and model assets at the database boundary", async () => {
  const c = await setup(),
    model = await c.promote(),
    input = await c.input();
  await assignPhysicalMedia(c.admin.context, input);
  const other = {
    ...c.draft,
    id: randomUUID(),
    slug: randomUUID(),
    revisionNumber: 2,
  };
  await createPhysicalMediaTemplate(c.admin.context, other);
  await db.physicalMediaTemplate.update({
    where: { id: other.id },
    data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
  });
  const foreign = await db.physicalMediaTextureSlot.findFirstOrThrow({
    where: { physicalMediaTemplateId: other.id },
  });
  await expect(
    db.physicalMediaTextureBinding.updateMany({
      where: { includedItemId: c.component.id },
      data: { physicalMediaTextureSlotId: foreign.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTextureBinding.updateMany({
      where: { includedItemId: c.component.id },
      data: { assetId: model.id },
    }),
  ).rejects.toThrow();
  await expect(
    db.physicalMediaTextureBinding.create({
      data: {
        includedItemId: c.component.id,
        physicalMediaTemplateId: c.draft.id,
        physicalMediaTextureSlotId: input.bindings[0].slotId,
        assetId: c.asset.id,
        transform: fullArtwork,
      },
    }),
  ).rejects.toThrow();
  const box = c.release.includedItems.find((c) => c.kind === "PACKAGING")!;
  await expect(
    db.gameReleaseIncludedItem.update({
      where: { id: box.id },
      data: { physicalMediaTemplateId: other.id },
    }),
  ).rejects.toThrow();
});

it("reads legacy metadata as unspecified without rewriting retained rows or preview contracts", async () => {
  const c = await setup();
  await db.physicalMediaTemplate.update({
    where: { id: c.draft.id },
    data: {
      metadata: {
        schemaVersion: 1,
        synthetic: true,
        measurementNote: c.draft.measurementNote,
      },
    },
  });
  await c.promote();
  await assignPhysicalMedia(c.admin.context, await c.input());
  const before = await db.physicalMediaTemplate.findUniqueOrThrow({
    where: { id: c.draft.id },
  });
  await createPhysicalMediaTemplate(c.admin.context, c.draft);
  const manager = await c.manager();
  expect(manager.templates.find((t) => t.id === c.draft.id)?.format).toEqual({
    schemaVersion: 1,
    formatKey: "unspecified",
    variant: "",
  });
  const detail = await getOwnedGame(c.admin.context, { id: c.copyId });
  expect(
    detail.media.find((t) => t.id === c.component.id)?.format?.formatKey,
  ).toBe("unspecified");
  const preview = await c.view();
  expect(preview.content).toMatchObject({
    rendererVersion: "cartridge-v1",
    kind: "PHYSICAL_MEDIA",
    familyKey: "cartridge",
  });
  expect(JSON.stringify(preview)).not.toMatch(
    /formatKey|measurementNote|storageNamespace/,
  );
  expect(
    await db.physicalMediaTemplate.findUniqueOrThrow({
      where: { id: c.draft.id },
    }),
  ).toEqual(before);
});
it("retains curator formats and variants, rejects conflicting retries and freezes approved metadata", async () => {
  const c = await setup(),
    model = await c.promote();
  const snes = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 2,
      format: {
        schemaVersion: 1,
        formatKey: "snes-us",
        variant: "Synthetic shell A",
      },
    },
    gb = {
      ...c.draft,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 3,
      format: {
        schemaVersion: 1,
        formatKey: "game-boy",
        variant: "Synthetic shell B",
      },
    };
  await createPhysicalMediaTemplate(c.admin.context, snes);
  await createPhysicalMediaTemplate(c.admin.context, snes);
  await createPhysicalMediaTemplate(c.admin.context, gb);
  await expect(
    createPhysicalMediaTemplate(c.admin.context, {
      ...snes,
      format: { ...snes.format, variant: "Conflicting shell" },
    }),
  ).rejects.toMatchObject({ code: "STALE" });
  await expect(
    createPhysicalMediaTemplate(c.admin.context, {
      ...snes,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 4,
      format: { ...snes.format, formatKey: "invented-format" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const t = (await c.manager()).templates.find((t) => t.id === snes.id)!;
  expect(t.format).toEqual(snes.format);
  expect(t.dimensions).toEqual(c.draft.dimensions);
  expect(
    (await c.manager()).templates.find((t) => t.id === gb.id)?.format,
  ).toEqual(gb.format);
  await db.physicalMediaTemplate.update({
    where: { id: snes.id },
    data: { baseModelAssetId: model.id, status: "READY", revision: 2 },
  });
  await assignPhysicalMedia(c.admin.context, {
    ...(await c.input()),
    templateId: snes.id,
    bindings: [
      { slotId: t.slots[0].id, assetId: c.asset.id, transform: fullArtwork },
    ],
  });
  expect(
    (await getOwnedGame(c.admin.context, { id: c.copyId })).media.find(
      (t) => t.id === c.component.id,
    )?.format,
  ).toEqual(snes.format);
  await expect(
    db.physicalMediaTemplate.update({
      where: { id: snes.id },
      data: {
        metadata: {
          schemaVersion: 1,
          synthetic: true,
          measurementNote: snes.measurementNote,
          format: gb.format,
        },
      },
    }),
  ).rejects.toThrow();
  const editor = await actor("EDITOR");
  await expect(
    createPhysicalMediaTemplate(editor.context, {
      ...gb,
      id: randomUUID(),
      slug: randomUUID(),
      revisionNumber: 4,
    }),
  ).rejects.toThrow();
});
import type { Prisma } from "@/server/db/generated/client";
const fixtureJson = (value: Prisma.JsonValue): Prisma.InputJsonValue => {
  if (value === null) throw new Error("Fixture requires JSON");
  return value;
};
it("bounds metadata choices per format while retaining old assignments and other formats", async () => {
  const c = await setup();
  await db.physicalMediaTemplate.update({
    where: { id: c.draft.id },
    data: {
      metadata: {
        schemaVersion: 1,
        synthetic: true,
        measurementNote: c.draft.measurementNote,
        format: {
          schemaVersion: 1,
          formatKey: "snes-us",
          variant: "Retained original study",
        },
      },
    },
  });
  await c.promote();
  await assignPhysicalMedia(c.admin.context, await c.input());
  const base = await db.physicalMediaTemplate.findUniqueOrThrow({
      where: { id: c.draft.id },
    }),
    slot = await db.physicalMediaTextureSlot.findFirstOrThrow({
      where: { physicalMediaTemplateId: c.draft.id },
    });
  const ids = Array.from({ length: 51 }, () => randomUUID()),
    otherId = randomUUID(),
    legacyId = randomUUID();
  const rows = ids.map((id, i) => ({
    ...base,
    id,
    slug: randomUUID(),
    revisionNumber: i + 2,
    status: "DRAFT" as const,
    revision: 1,
    dimensions: fixtureJson(base.dimensions),
    materialSettings: fixtureJson(base.materialSettings),
    cameraSettings: fixtureJson(base.cameraSettings),
    metadata: fixtureJson(base.metadata),
  }));
  await db.physicalMediaTemplate.createMany({
    data: [
      ...rows,
      {
        ...rows[0],
        id: otherId,
        slug: randomUUID(),
        revisionNumber: 53,
        metadata: {
          schemaVersion: 1,
          synthetic: true,
          measurementNote: "Original study",
          format: {
            schemaVersion: 1,
            formatKey: "game-boy",
            variant: "Independent study",
          },
        },
      },
      {
        ...rows[0],
        id: legacyId,
        slug: randomUUID(),
        revisionNumber: 54,
        metadata: {
          schemaVersion: 1,
          synthetic: true,
          measurementNote: "Legacy study without format",
        },
      },
    ],
  });
  await db.physicalMediaTextureSlot.createMany({
    data: [...ids, otherId, legacyId].map((id) => ({
      ...slot,
      id: randomUUID(),
      physicalMediaTemplateId: id,
      target: fixtureJson(slot.target),
    })),
  });
  const manager = await c.manager();
  expect(manager.moreTemplates).toBe(true);
  expect(
    manager.templates.filter((t) => t.format.formatKey === "snes-us"),
  ).toHaveLength(51);
  expect(manager.templates.find((t) => t.id === c.draft.id)).toMatchObject({
    status: "READY",
    format: { formatKey: "snes-us" },
  });
  expect(manager.templates.find((t) => t.id === ids[0])).toBeUndefined();
  expect(
    manager.templates.find((t) => t.id === otherId)?.format.formatKey,
  ).toBe("game-boy");
  expect(
    manager.templates.find((t) => t.id === legacyId)?.format.formatKey,
  ).toBe("unspecified");
});
