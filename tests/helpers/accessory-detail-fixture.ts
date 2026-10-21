import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { PrismaClient } from "../../src/server/db/generated/client";
import { artwork } from "./game-detail-fixture";
import { modelFixture } from "./model-fixture";
import { createObjectLocator } from "../../src/server/storage/objects";
import { getObjectStorage } from "../../src/server/storage";
export async function seedAccessoryDetail(
  db: PrismaClient,
  input: {
    accessoryId: string;
    variantId: string;
    longTitle?: boolean;
    empty?: boolean;
  },
) {
  if (!process.env.DATABASE_URL?.includes("/gemukore_test?schema=public"))
    throw new Error("Accessory detail fixtures require the isolated database.");
  const name = input.longTitle
    ? `DualShock 2 ${"LongUnbrokenAccessoryFamilyName".repeat(4)}`
    : "DualShock 2";
  const copy = await db.collectionItem.create({
    data: {
      type: "ACCESSORY",
      serialNumber: "COPY-DS2-001",
      notes: "Private controller notes.",
      ownedAccessory: { create: { accessoryVariantId: input.variantId } },
      defects: {
        create: {
          title: "Cable wear",
          severity: "MINOR",
          description: "Wear near the plug",
        },
      },
    },
  });
  await db.accessory.update({
    where: { id: input.accessoryId },
    data: {
      name,
      description: input.empty ? null : "Family controller description.",
      specifications: input.empty
        ? undefined
        : {
            schemaVersion: 1,
            data: { connection: "Wired", vibration: true, weightGrams: null },
          },
      trailerProvider: input.empty ? null : "YOUTUBE",
      trailerId: input.empty ? null : "AbCdEf123_-",
    },
  });
  await db.accessoryVariant.update({
    where: { id: input.variantId },
    data: {
      descriptionOverride: input.empty
        ? null
        : "Description for the black controller.",
      specificationsOverride: input.empty
        ? undefined
        : { schemaVersion: 1, data: { cableLength: "2 m" } },
      releaseYear: 2001,
    },
  });
  if (input.empty)
    return {
      id: copy.id,
      name,
      title: `${name} · Black`,
      modelId: null,
      variantImageId: null,
    };
  const familyImage = await artwork(
      db,
      "CATALOG",
      "ACCESSORY FAMILY",
      "#855a32",
    ),
    variantImage = await artwork(db, "CATALOG", "BLACK VARIANT", "#315952"),
    photo = await artwork(db, "COLLECTION", "MY CONTROLLER", "#6b456b");
  await db.catalogAsset.createMany({
    data: [
      {
        accessoryId: input.accessoryId,
        role: "COVER",
        assetId: familyImage.id,
        altText: "Synthetic accessory family image",
      },
      {
        accessoryVariantId: input.variantId,
        role: "PREVIEW",
        isPrimary: true,
        assetId: variantImage.id,
        altText: "Synthetic black variant image",
      },
    ],
  });
  await db.collectionItemMedia.create({
    data: {
      collectionItemId: copy.id,
      type: "PHOTO",
      assetId: photo.id,
      caption: "Personal controller photo",
      altText: "My synthetic controller",
    },
  });
  const bytes = modelFixture().bytes,
    id = randomUUID(),
    locator = createObjectLocator(id, "model/gltf-binary"),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  await getObjectStorage().put({
    locator,
    openBody: () => Readable.from([bytes]),
    sizeBytes: bytes.length,
    contentType: "model/gltf-binary",
    metadata: { assetId: id, sha256 },
  });
  await db.asset.create({
    data: {
      id,
      ...locator,
      kind: "MODEL_3D",
      scope: "CATALOG",
      state: "READY",
      mimeType: "model/gltf-binary",
      sizeBytes: bytes.length,
      sha256,
      sourceType: "CURATED",
      licenseName: "Synthetic test geometry",
    },
  });
  await db.catalogAsset.create({
    data: {
      accessoryId: input.accessoryId,
      role: "MODEL_3D",
      assetId: id,
      isPrimary: true,
    },
  });
  return {
    id: copy.id,
    name,
    title: `${name} · Black`,
    modelId: id,
    variantImageId: variantImage.id,
  };
}
