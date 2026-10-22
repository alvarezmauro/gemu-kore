import { randomUUID, createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Asset, PrismaClient } from "../../src/server/db/generated/client";
import { seedPublicDetailData } from "./public-detail-data";
import { monochromePng } from "./png-fixtures";
import { createObjectLocator } from "../../src/server/storage/objects";

// Only reached through the disposable browser fixture runner. These canaries
// deliberately occupy private columns and source bytes, never approved labels.
export async function seedPublicPrivacyData(db: PrismaClient) {
  const data = await seedPublicDetailData(db);
  const canary = "PRIVACY-CANARY-" + randomUUID();
  const displayBytes = monochromePng(80, 60);
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  try {
    const assets: Asset[] = [];
    for (const original of [true, false]) {
      const id = randomUUID();
      const { objectKey } = createObjectLocator(id, "image/png");
      const bytes = original
        ? Buffer.concat([displayBytes, Buffer.from(canary)])
        : displayBytes;
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: objectKey,
          Body: bytes,
          ContentType: "image/png",
        }),
      );
      await db.asset.create({
        data: {
          id,
          objectKey,
          storageNamespace: "primary",
          scope: "COLLECTION",
          kind: "IMAGE",
          deliveryClass: original ? "ORIGINAL" : "DISPLAY",
          mimeType: "image/png",
          sizeBytes: bytes.length,
          width: 80,
          height: 60,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          originalFilename: canary + ".png",
          metadata: { private: canary },
          rightsStatus: "APPROVED",
          publicSafe: !original,
          reviewedAt: original ? null : new Date(),
          ...(!original
            ? {
                inputs: {
                  create: {
                    sourceAssetId: assets[0].id,
                    purpose: "SANITIZE",
                  },
                },
              }
            : {}),
        },
      });
      assets.push(
        await db.asset.update({ where: { id }, data: { state: "READY" } }),
      );
    }
    const [source, display] = assets;
    const common = {
      assetId: source.id,
      publicDisplayAssetId: display.id,
      publicApproved: true,
      approvedAt: new Date(),
    };
    const personal = await db.collectionItemMedia.create({
      data: {
        ...common,
        collectionItemId: data.ids[0],
        type: "PHOTO",
        altText: "Reviewed personal exhibit",
        caption: "Reviewed display only",
      },
    });
    const privateUse = await db.collectionItemMedia.create({
      data: {
        ...common,
        collectionItemId: data.privateId,
        type: "PHOTO",
        caption: canary,
      },
    });
    const unapproved = await db.collectionItemMedia.create({
      data: {
        ...common,
        collectionItemId: data.ids[0],
        type: "PHOTO",
        publicApproved: false,
        approvedAt: null,
        caption: canary,
      },
    });
    const serial = await db.collectionItemMedia.create({
      data: {
        ...common,
        collectionItemId: data.ids[0],
        type: "SERIAL",
        caption: canary,
      },
    });
    const logo = await db.appAsset.create({
      data: { ...common, appSettingsId: 1 },
    });
    const owned = await db.ownedGame.findUniqueOrThrow({
      where: { collectionItemId: data.ids[1] },
    });
    await db.gameRelease.update({
      where: { id: owned.gameReleaseId },
      data: {
        metadata: { schemaVersion: 1, data: { providerSnapshot: canary } },
      },
    });
    const ownedConsole = await db.ownedConsole.findUniqueOrThrow({
      where: { collectionItemId: data.ids[0] },
    });
    const markup =
      '<script id="privacy-probe">globalThis.__privacyProbe = 1</script>';
    await db.consoleModel.update({
      where: { id: ownedConsole.consoleModelId },
      data: {
        description: markup,
      },
    });
    await db.defect.updateMany({
      where: { collectionItemId: { in: data.ids } },
      data: {
        repairNote: canary,
      },
    });
    return {
      ...data,
      canary,
      markup,
      sourceId: source.id,
      displayId: display.id,
      privateLocators: assets.map((asset) => asset.objectKey),
      displaySize: displayBytes.length,
      personalUrl:
        "/api/media/public/items/" + data.ids[0] + "/personal/" + personal.id,
      logoUrl: "/api/media/public/site/" + logo.id,
      deniedUses: [
        "/api/media/public/items/" +
          data.privateId +
          "/personal/" +
          privateUse.id,
        "/api/media/public/items/" + data.ids[0] + "/personal/" + privateUse.id,
        "/api/media/public/items/" + data.ids[0] + "/personal/" + unapproved.id,
        "/api/media/public/items/" + data.ids[0] + "/personal/" + serial.id,
      ],
    };
  } finally {
    client.destroy();
  }
}
