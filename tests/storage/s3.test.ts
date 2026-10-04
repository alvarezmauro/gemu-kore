import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { createS3ObjectStorage } from "../../src/server/storage/s3";
import {
  createObjectLocator,
  maximumObjectBytes,
} from "../../src/server/storage/objects";

const config = inject("storageConfig");
const storage = createS3ObjectStorage(config);
const admin = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
  maxAttempts: 1,
});
const bytes = Buffer.from("private-fixture-contents");
function upload(body = bytes) {
  const assetId = randomUUID();
  return {
    locator: createObjectLocator(assetId, "image/png"),
    contentType: "image/png" as const,
    sizeBytes: body.length,
    openBody: () => Readable.from([body]),
    metadata: {
      assetId,
      sha256: createHash("sha256").update(body).digest("hex"),
    },
  };
}
async function consume(body: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  await admin.send(new CreateBucketCommand({ Bucket: config.bucket }));
});
afterAll(() => {
  storage.close();
  admin.destroy();
});

it("round-trips exact bytes, validated content type and only technical metadata", async () => {
  const input = upload();
  await expect(storage.put(input)).resolves.toMatchObject({
    sizeBytes: bytes.length,
  });
  expect(await storage.stat(input.locator)).toMatchObject({
    sizeBytes: bytes.length,
    contentType: "image/png",
  });
  const object = await storage.get(input.locator);
  expect(await consume(object.body)).toEqual(bytes);
  const stored = await admin.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: input.locator.objectKey,
    }),
  );
  expect(stored.Metadata).toEqual({
    "asset-id": input.metadata.assetId,
    sha256: input.metadata.sha256,
  });
  await storage.remove(input.locator);
  await expect(storage.remove(input.locator)).resolves.toBeUndefined();
  expect(await storage.stat(input.locator)).toBeNull();
  await expect(storage.get(input.locator)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("denies an unsigned direct object request", async () => {
  const input = upload();
  await storage.put(input);
  const response = await fetch(
    `${config.endpoint}/${config.bucket}/${input.locator.objectKey}`,
  );
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain(bytes.toString());
});
it.each([{ start: 2, end: 6 }, { start: 3 }, { start: 0, end: 999 }])(
  "returns exact range bytes for %j",
  async (range) => {
    const input = upload();
    await storage.put(input);
    const object = await storage.get(input.locator, { range });
    const end = Math.min(range.end ?? bytes.length - 1, bytes.length - 1);
    expect(object.range).toEqual({
      start: range.start,
      end,
      totalBytes: bytes.length,
    });
    expect(object.sizeBytes).toBe(end - range.start + 1);
    expect(await consume(object.body)).toEqual(
      bytes.subarray(range.start, end + 1),
    );
  },
);
it("rejects unsatisfiable/invalid ranges without returning full files", async () => {
  const input = upload();
  await storage.put(input);
  await expect(
    storage.get(input.locator, { range: { start: 999 } }),
  ).rejects.toMatchObject({ code: "INVALID_RANGE" });
  await expect(
    storage.get(input.locator, { range: { start: -1 } }),
  ).rejects.toMatchObject({ code: "INVALID_RANGE" });
});
it("keeps denied credentials distinguishable from a missing object", async () => {
  const denied = createS3ObjectStorage({
    ...config,
    secretAccessKey: "incorrect-test-secret",
  });
  try {
    await expect(denied.stat(upload().locator)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  } finally {
    denied.close();
  }
});

it("does not report an unprovisioned bucket as a missing object", async () => {
  const missingBucket = createS3ObjectStorage({
    ...config,
    bucket: `gemukore-missing-${randomUUID()}`,
  });
  try {
    await expect(missingBucket.stat(upload().locator)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  } finally {
    missingBucket.close();
  }
});
it("cancels before opening an upload source", async () => {
  let opened = false;
  const controller = new AbortController();
  controller.abort("private-cancellation-reason");
  await expect(
    storage.put({
      ...upload(),
      signal: controller.signal,
      openBody: () => {
        opened = true;
        return Readable.from([bytes]);
      },
    }),
  ).rejects.toMatchObject({ code: "ABORTED" });
  expect(opened).toBe(false);
});
it("rejects declared oversized objects before opening a body", async () => {
  let opened = false;
  await expect(
    storage.put({
      ...upload(),
      sizeBytes: maximumObjectBytes + 1,
      openBody: () => {
        opened = true;
        return Readable.from([bytes]);
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(opened).toBe(false);
});
it.each([0, bytes.length - 1, bytes.length + 1])(
  "rejects actual/declaration length mismatch: %s",
  async (sizeBytes) => {
    await expect(storage.put({ ...upload(), sizeBytes })).rejects.toMatchObject(
      { code: "INVALID_INPUT" },
    );
  },
);
it("rejects bytes that do not match their expected hash", async () => {
  const input = upload();
  await expect(
    storage.put({
      ...input,
      metadata: { ...input.metadata, sha256: "0".repeat(64) },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("supports empty objects with the correct empty hash", async () => {
  const input = upload(Buffer.alloc(0));
  await storage.put(input);
  expect(await consume((await storage.get(input.locator)).body)).toEqual(
    Buffer.alloc(0),
  );
});
it("rejects unknown namespaces and mismatched metadata before network access", async () => {
  const input = upload();
  await expect(
    storage.put({
      ...input,
      locator: { ...input.locator, storageNamespace: "unconfigured" },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    storage.put({
      ...input,
      metadata: { ...input.metadata, assetId: randomUUID() },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
