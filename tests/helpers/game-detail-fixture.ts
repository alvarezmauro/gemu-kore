import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import type { PrismaClient } from "../../src/server/db/generated/client";
import { getObjectStorage } from "../../src/server/storage";
import { createObjectLocator } from "../../src/server/storage/objects";

// Original synthetic artwork, never a copied retail cover or external download.
export async function artwork(
  db: PrismaClient,
  scope: "CATALOG" | "COLLECTION",
  label: string,
  color: string,
) {
  const bytes = await sharp(
    Buffer.from(
      `<svg width="300" height="400"><rect width="300" height="400" fill="${color}"/><circle cx="150" cy="160" r="78" fill="#f2ebe0"/><path d="M80 230L220 90M80 90L220 230" stroke="#373333" stroke-width="18"/><text x="150" y="310" text-anchor="middle" font-family="sans-serif" font-size="26" fill="white">${label}</text><text x="150" y="350" text-anchor="middle" font-family="sans-serif" font-size="15" fill="white">SYNTHETIC TEST ART</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
  const id = randomUUID(),
    locator = createObjectLocator(id, "image/png"),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  await getObjectStorage().put({
    locator,
    openBody: () => Readable.from([bytes]),
    sizeBytes: bytes.length,
    contentType: "image/png",
    metadata: { assetId: id, sha256 },
  });
  return db.asset.create({
    data: {
      id,
      ...locator,
      scope,
      state: "READY",
      kind: "IMAGE",
      deliveryClass: "DISPLAY",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      width: 300,
      height: 400,
      sha256,
      sourceType: "USER_UPLOAD",
      licenseName: "Original synthetic test artwork",
      attribution: "GemuKore test fixture; not retail artwork.",
    },
  });
}

export async function seedGameDetail(
  db: PrismaClient,
  input: {
    id: string;
    releaseId: string;
    longTitle?: boolean;
    screenshots?: boolean;
  },
) {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Game detail fixtures require the isolated database.");
  const release = await db.gameRelease.findUniqueOrThrow({
    where: { id: input.releaseId },
  });
  const title = input.longTitle
    ? `Chrono Trigger ${"VeryLongUnbrokenCollectorEditionTitle".repeat(4)}`
    : "Chrono Trigger";
  const company = await db.company.create({
    data: { name: "Synthetic studio", slug: randomUUID() },
  });
  await db.game.update({
    where: { id: release.gameId },
    data: {
      name: title,
      description: "A shared game description.",
      companies: { create: { companyId: company.id, role: "DEVELOPER" } },
    },
  });
  await db.gameRelease.update({
    where: { id: release.id },
    data: {
      descriptionOverride: "A release-specific description.",
      firstReleaseYear: 1994,
      companies: { create: { companyId: company.id, role: "PUBLISHER" } },
      identifiers: {
        create: {
          scheme: "PRODUCT_CODE",
          value: "SYNTH-001",
          normalizedValue: "synth-001",
          issuer: "Synthetic studio",
          marketNote: "North America",
        },
      },
    },
  });
  await db.collectionItem.update({
    where: { id: input.id },
    data: {
      serialNumber: "COPY-0001",
      notes: "Private copy notes.",
      hasBox: null,
    },
  });
  const gameCover = await artwork(db, "CATALOG", "GAME COVER", "#855a32"),
    releaseCover = await artwork(db, "CATALOG", "RELEASE COVER", "#315952"),
    photo = await artwork(db, "COLLECTION", "MY PHOTO", "#6b456b");
  await db.catalogAsset.createMany({
    data: [
      {
        gameId: release.gameId,
        assetId: gameCover.id,
        role: "COVER",
        isPrimary: true,
        altText: "Synthetic game default cover",
      },
      {
        gameReleaseId: release.id,
        assetId: releaseCover.id,
        role: "COVER",
        isPrimary: true,
        altText: "Synthetic release cover",
      },
    ],
  });
  await db.collectionItemMedia.create({
    data: {
      collectionItemId: input.id,
      assetId: photo.id,
      type: "PHOTO",
      caption: "A personal copy photo",
      publicApproved: false,
    },
  });
  if (input.screenshots) {
    for (const [index, color] of ["#315952", "#855a32"].entries()) {
      const scene = await artwork(db, "CATALOG", `SCENE ${index + 1}`, color);
      await db.catalogAsset.create({
        data: {
          gameReleaseId: release.id,
          assetId: scene.id,
          role: "SCREENSHOT",
          sortOrder: index,
          caption: `Synthetic scene ${index + 1}`,
          altText: `Original test scene ${index + 1}`,
        },
      });
    }
  }
  return {
    title,
    gameCoverId: gameCover.id,
    releaseCoverId: releaseCover.id,
    photoId: photo.id,
  };
}
