import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  PutBucketLifecycleConfigurationCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getDatabase, disconnectDatabase } from "../../src/server/db/client";
import { getObjectStorage } from "../../src/server/storage";

async function main() {
  if (
    !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
    process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
  )
    throw new Error("Isolated production runner required");
  const db = getDatabase();
  const [command] = process.argv.slice(2);
  try {
    if (command === "storage-policy") {
      const client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
        maxAttempts: 1,
      });
      const id = "00000000-0000-4000-8000-000000000033";
      const locator = {
        storageNamespace: "primary",
        objectKey: `assets/${id}/00000000-0000-4000-8000-000000000034.png`,
      };
      const storage = getObjectStorage();
      const bytes = Buffer.from("isolated storage policy probe");
      try {
        await storage.put({
          locator,
          openBody: () => Readable.from(bytes),
          sizeBytes: bytes.length,
          contentType: "image/png",
          metadata: {
            assetId: id,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        });
        assert.equal((await storage.stat(locator))?.sizeBytes, bytes.length);
        const part = await storage.get(locator, {
          range: { start: 0, end: 7 },
        });
        const chunks: Buffer[] = [];
        for await (const chunk of part.body) chunks.push(Buffer.from(chunk));
        assert.deepEqual(Buffer.concat(chunks), bytes.subarray(0, 8));
        // Benign control requests use a real scoped key. Neither XML body may
        // reach Garage through the public edge, even with valid signatures.
        for (const request of [
          () =>
            client.send(
              new PutBucketLifecycleConfigurationCommand({
                Bucket: process.env.S3_BUCKET,
                LifecycleConfiguration: {
                  Rules: [
                    {
                      ID: "blocked-probe",
                      Status: "Disabled",
                      Filter: { Prefix: "security-probe/" },
                      Expiration: { Days: 365 },
                    },
                  ],
                },
              }),
            ),
          () =>
            client.send(
              new PutObjectTaggingCommand({
                Bucket: process.env.S3_BUCKET,
                Key: locator.objectKey,
                Tagging: { TagSet: [] },
              }),
            ),
        ])
          await assert.rejects(request, (error: unknown) =>
            Boolean(
              error &&
              typeof error === "object" &&
              "$metadata" in error &&
              (error.$metadata as { httpStatusCode?: number })
                .httpStatusCode === 404,
            ),
          );
      } finally {
        client.destroy();
        await storage.remove(locator);
      }
      assert.equal(await storage.stat(locator), null);
      return;
    }
    if (command === "capture-backup") {
      const tableNames = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'session' ORDER BY tablename`;
      const tables: Record<string, string> = {};
      for (const { tablename } of tableNames) {
        const quoted = '"' + tablename.replaceAll('"', '""') + '"';
        const rows = await db.$queryRawUnsafe(
          `SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) AS data FROM public.${quoted} t`,
        );
        tables[tablename] = createHash("sha256")
          .update(JSON.stringify(rows))
          .digest("hex");
      }
      const assets = await db.asset.findMany({
        where: { state: "READY" },
        orderBy: { id: "asc" },
      });
      assert.ok(assets.length >= 6);
      assert.ok(assets.some((asset) => asset.deliveryClass === "ORIGINAL"));
      assert.ok(assets.some((asset) => asset.mimeType === "model/gltf-binary"));
      for (const asset of assets) {
        const object = await getObjectStorage().get({
          storageNamespace: asset.storageNamespace!,
          objectKey: asset.objectKey!,
        });
        const hash = createHash("sha256");
        let bytes = 0;
        for await (const chunk of object.body) {
          hash.update(chunk);
          bytes += chunk.length;
        }
        assert.equal(hash.digest("hex"), asset.sha256);
        assert.equal(bytes, Number(asset.sizeBytes));
      }
      const photo = assets.find(
        (asset) =>
          asset.mimeType === "image/webp" && asset.deliveryClass === "DISPLAY",
      )!;
      const model = assets.find(
        (asset) => asset.mimeType === "model/gltf-binary",
      )!;
      console.info(
        JSON.stringify({ tables, photoId: photo.id, modelId: model.id }),
      );
      return;
    }
    if (command === "privileges") {
      const url = new URL(process.env.DATABASE_URL!);
      url.username = "gemukore_app";
      // Password supplied only to the disposable operations container.
      url.password = process.env.TEST_APP_PASSWORD!;
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const { PrismaClient } =
        await import("../../src/server/db/generated/client");
      const runtime = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.href }),
      });
      try {
        const roles = await runtime.$queryRaw<
          {
            current_user: string;
            rolsuper: boolean;
            rolcreatedb: boolean;
            rolcreaterole: boolean;
          }[]
        >`
          SELECT current_user, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
        assert.equal(roles[0].current_user, "gemukore_app");
        assert.equal(
          roles[0].rolsuper || roles[0].rolcreatedb || roles[0].rolcreaterole,
          false,
        );
        await runtime.appSettings.findUniqueOrThrow({ where: { id: 1 } });
        await assert.rejects(
          runtime.$executeRawUnsafe(
            "CREATE TABLE public.must_not_exist (id integer)",
          ),
        );
        await assert.rejects(
          runtime.$queryRawUnsafe('SELECT * FROM "_prisma_migrations"'),
        );
      } finally {
        await runtime.$disconnect();
      }
      return;
    }
    const locator = {
      storageNamespace: "primary",
      objectKey:
        "assets/00000000-0000-4000-8000-000000000022/00000000-0000-4000-8000-000000000001.png",
    };
    const bytes = Buffer.from("retained production test object");
    const storage = getObjectStorage();
    if (command === "seed") {
      await db.appSettings.update({
        where: { id: 1 },
        data: { collectionDescription: "production persistence probe" },
      });
      await storage.put({
        locator,
        openBody: () => Readable.from(bytes),
        sizeBytes: bytes.length,
        contentType: "image/png",
        metadata: {
          assetId: "00000000-0000-4000-8000-000000000022",
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      });
    } else if (command === "check") {
      assert.equal(
        (await db.appSettings.findUniqueOrThrow({ where: { id: 1 } }))
          .collectionDescription,
        "production persistence probe",
      );
      assert.equal((await storage.stat(locator))?.sizeBytes, bytes.length);
      const object = await storage.get(locator);
      const chunks: Buffer[] = [];
      for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      assert.deepEqual(Buffer.concat(chunks), bytes);
    } else throw new Error("Unknown production probe");
  } finally {
    await disconnectDatabase();
  }
}
void main().catch(() => {
  console.error("Isolated production probe failed.");
  process.exitCode = 1;
});
