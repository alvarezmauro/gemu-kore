import { randomUUID, createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PrismaClient } from "../../src/server/db/generated/client";
import { seedDashboardData } from "./dashboard-data";
import { modelFixture } from "./model-fixture";
import { monochromePng } from "./png-fixtures";
import { boxFaces, fullArtwork } from "../../src/lib/three/packaging-contracts";
export async function seedPublicDetailData(
  db: PrismaClient,
  longTitle = false,
) {
  const data = await seedDashboardData(db, longTitle);
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  async function asset(bytes: Buffer, model = false) {
    const id = randomUUID(),
      mimeType = model ? "model/gltf-binary" : "image/png",
      objectKey = `assets/${id}/${randomUUID()}.${model ? "glb" : "png"}`;
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: objectKey,
        Body: bytes,
        ContentType: mimeType,
      }),
    );
    return db.asset.create({
      data: {
        id,
        kind: model ? "MODEL_3D" : "IMAGE",
        scope: "CATALOG",
        state: "READY",
        deliveryClass: "DISPLAY",
        storageNamespace: "primary",
        objectKey,
        mimeType,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: model ? null : 80,
        height: model ? null : 60,
        publicSafe: true,
        reviewedAt: new Date(),
        rightsStatus: "APPROVED",
      },
    });
  }
  try {
    const photo = await asset(monochromePng(80, 60)),
      model = await asset(modelFixture().bytes, true);
    const imageUse = await db.catalogAsset.create({
      data: {
        consoleModelId: data.model.id,
        assetId: photo.id,
        publicDisplayAssetId: photo.id,
        publicApproved: true,
        approvedAt: new Date(),
        role: "GALLERY",
        caption: "Synthetic collection exhibit",
        altText: "A neutral synthetic exhibit image",
      },
    });
    const modelUse = await db.catalogAsset.create({
      data: {
        consoleModelId: data.model.id,
        assetId: model.id,
        publicDisplayAssetId: model.id,
        publicApproved: true,
        approvedAt: new Date(),
        role: "MODEL_3D",
      },
    });
    const ids = data.items.slice(0, 3).map((i) => i.id);
    await db.collectionItem.updateMany({
      where: { id: { in: ids } },
      data: { publicationStatus: "PUBLISHED", publishedAt: new Date() },
    });
    await db.publicSettings.update({
      where: { id: 1 },
      data: { publicCollectionEnabled: true },
    });
    const t = await db.packagingTemplate.create({
      data: {
        name: "Synthetic public box",
        slug: randomUUID(),
        revisionNumber: 1,
        dimensions: {
          schemaVersion: 1,
          widthMm: 180,
          heightMm: 125,
          depthMm: 30,
        },
        materialSettings: { schemaVersion: 1 },
        cameraSettings: { preset: "package" },
        metadata: {
          schemaVersion: 1,
          synthetic: true,
          measurementNote: "Synthetic fixture",
        },
        slots: {
          create: boxFaces.map((f) => ({
            name: f.name,
            required: f.required,
            materialName: `box:${f.name}`,
            target: { schemaVersion: 1, kind: "PROCEDURAL_FACE", face: f.face },
          })),
        },
      },
      include: { slots: true },
    });
    await db.packagingTemplate.update({
      where: { id: t.id },
      data: { status: "READY" },
    });
    const c = await db.gameReleaseIncludedItem.create({
      data: {
        gameReleaseId: data.release.id,
        kind: "PACKAGING",
        name: "Expected outer box",
        packagingTemplateId: t.id,
      },
    });
    for (const s of t.slots)
      await db.packagingTextureBinding.create({
        data: {
          includedItemId: c.id,
          packagingTemplateId: t.id,
          packagingTextureSlotId: s.id,
          assetId: photo.id,
          transform: fullArtwork,
        },
      });
    await db.gameReleaseIncludedItem.update({
      where: { id: c.id },
      data: {
        presentationApproved: true,
        presentationReviewedAt: new Date(),
        presentationTemplateRevision: 1,
      },
    });
    return {
      ids,
      privateId: data.items[3].id,
      modelAssetId: model.id,
      imageAssetId: photo.id,
      imageUseId: imageUse.id,
      modelUseId: modelUse.id,
      componentId: c.id,
      photoSize: Number(photo.sizeBytes),
      imageUrl: `/api/media/public/items/${ids[0]}/catalog/${imageUse.id}`,
    };
  } finally {
    client.destroy();
  }
}
