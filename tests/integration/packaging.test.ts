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

import {
  createPackagingTemplate,
  changePackagingTemplate,
  assignPackaging,
  getPackagingManager,
} from "@/server/services/catalog/physical-editions";
import { getGamePackagingPresentation } from "@/server/services/collection/game-presentation";
import { fullArtwork } from "@/lib/three/packaging-contracts";
import { hasReferences, hasFamilyUses } from "@/server/repositories/assets";
async function setup() {
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
    familyKey: "snes-cardboard",
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
    bindings: (await manager()).templates[0].slots
      .filter((s) => s.required)
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
