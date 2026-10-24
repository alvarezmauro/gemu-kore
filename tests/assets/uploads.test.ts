import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  inject,
  it,
  vi,
} from "vitest";
import { getDatabase, disconnectDatabase } from "@/server/db/client";
import { requirePrivateAccess } from "@/server/auth/access";
import {
  completeUpload,
  deleteUnusedAsset,
  uploadAsset,
} from "@/server/services/assets";
import {
  completeRequest,
  privateMediaRequest,
  uploadRequest,
} from "@/server/http/assets";
import { createS3ObjectStorage } from "@/server/storage/s3";
import { StorageError } from "@/server/storage/errors";
import { createObjectLocator } from "@/server/storage/objects";
import { signedSessionCookie } from "../helpers/access-session";

const db = getDatabase();
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
});
const secret =
  "asset-integration-only-secret-longer-than-thirty-two-characters";
afterEach(() => vi.restoreAllMocks());
let companyId: string;
let headers: Headers;
let userId: string;
let grantId: string;
const signal = () => AbortSignal.timeout(20000);
const body = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
async function image() {
  return sharp({
    create: { width: 80, height: 40, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { ImageDescription: "private owner information" } })
    .toBuffer();
}
const target = () => ({
  kind: "catalog",
  target: "company",
  id: companyId,
  role: "LOGO",
});
async function send(bytes: Buffer, overrides: Record<string, string> = {}) {
  return uploadRequest(
    new Request("http://localhost:3002/api/uploads", {
      method: "POST",
      headers: {
        ...Object.fromEntries(headers),
        "content-type": "image/jpeg",
        "x-file-name": encodeURIComponent("my personal photo.jpg"),
        "x-gemukore-target": JSON.stringify(target()),
        "content-length": String(bytes.length),
        ...overrides,
      },
      body: new Uint8Array(bytes),
    }),
  );
}
beforeAll(async () => {
  await admin.send(new CreateBucketCommand({ Bucket: config.bucket }));
});
beforeEach(async () => {
  await db.$executeRaw`TRUNCATE asset, company, console_platform, console_model, collection_item CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
  companyId = (
    await db.company.create({
      data: { name: "Asset maker", slug: randomUUID() },
    })
  ).id;
  const user = await db.user.create({
    data: {
      name: "Upload fixture",
      email: "assets@example.com",
      emailVerified: true,
    },
  });
  userId = user.id;
  const session = await db.session.create({
    data: {
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const grant = await db.accessGrant.create({
    data: { email: user.email, role: "ADMIN", enabled: true },
  });
  grantId = grant.id;
  headers = new Headers({
    cookie: `gemukore.session_token=${signedSessionCookie(session.token, secret)}`,
    origin: "http://localhost:3002",
  });
});
afterAll(async () => {
  await db.$executeRaw`TRUNCATE asset, company, console_platform, console_model, collection_item CASCADE`;
  await db.accessGrant.deleteMany();
  await db.user.deleteMany();
  await disconnectDatabase();
  storage.close();
  admin.destroy();
});

it("uploads through the request boundary, preserves originals and strips oriented display copies", async () => {
  const bytes = await image();
  const response = await send(bytes);
  expect(response.status).toBe(201);
  const dto = await response.json();
  expect(dto.files).toHaveLength(3);
  expect(JSON.stringify(dto)).not.toContain("objectKey");
  const assets = await db.asset.findMany();
  expect(assets).toHaveLength(3);
  expect(
    assets.every(
      (a) =>
        a.state === "READY" && !a.publicSafe && a.rightsStatus === "UNKNOWN",
    ),
  ).toBe(true);
  const original = assets.find((a) => a.deliveryClass === "ORIGINAL")!;
  expect(original.sha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(original.objectKey).not.toContain("personal");
  const media = await privateMediaRequest(
    new Request("http://localhost:3002" + dto.files[0].url, { headers }),
    original.id,
  );
  expect(Buffer.from(await media.arrayBuffer())).toEqual(bytes);
  expect(media.headers.get("cache-control")).toContain("no-store");
  for (const entry of dto.files.slice(1)) {
    const read = await privateMediaRequest(
      new Request("http://localhost:3002" + entry.url, { headers }),
      entry.id,
    );
    const metadata = await sharp(
      Buffer.from(await read.arrayBuffer()),
    ).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 40, height: 80 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  }
  expect(await db.catalogAsset.findMany()).toMatchObject([
    {
      assetId: dto.files[2].id,
      publicApproved: false,
      publicDisplayAssetId: null,
    },
  ]);
  const retry = await completeRequest(
    new Request("http://localhost:3002/api/uploads/complete", {
      method: "POST",
      headers,
    }),
    dto.uploadId,
  );
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual(dto);
  expect(await db.catalogAsset.count()).toBe(1);
});

it("records upload outcomes with opaque correlation and no private filename, metadata or credentials", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await send(await image());
  expect(response.status).toBe(201);
  const saved = await response.json();
  const events = info.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(events).toMatchObject([
    { operation: "asset.upload", outcome: "started" },
    {
      operation: "asset.upload",
      outcome: "succeeded",
      uploadId: saved.uploadId,
    },
  ]);
  expect(events[0].correlationId).toBe(events[1].correlationId);
  expect((await send(Buffer.from("invalid photo"))).status).toBe(400);
  expect(
    errors.mock.calls.map(([line]) => JSON.parse(String(line))),
  ).toMatchObject([
    {
      operation: "asset.upload",
      outcome: "failed",
      code: "INVALID_INPUT",
      uploadId: expect.any(String),
    },
  ]);
  expect([...info.mock.calls, ...errors.mock.calls].flat().join()).not.toMatch(
    /personal|my%20|private owner|session_token|assets@example|secret-longer|invalid photo/,
  );
});
it("authorizes before storage even for conditional reads and rejects CSRF", async () => {
  const anon = await uploadRequest(
    new Request("http://localhost:3002/api/uploads", { method: "POST" }),
  );
  expect(anon.status).toBe(401);
  expect(
    (await send(await image(), { origin: "https://untrusted.example" })).status,
  ).toBe(403);
  const id = randomUUID();
  for (const method of ["GET", "HEAD"]) {
    const response = await privateMediaRequest(
      new Request("http://localhost:3002/", {
        method,
        headers: { "if-none-match": '"anything"' },
      }),
      id,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
  expect(await db.asset.count()).toBe(0);
});
it("enforces current roles and prevents editor uploads to canonical targets", async () => {
  await db.accessGrant.update({
    where: { id: grantId },
    data: { role: "EDITOR" },
  });
  expect((await send(await image())).status).toBe(403);
  expect(await db.asset.count()).toBe(0);
});
it.each([
  "<html>not an image</html>",
  "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
  "not an image",
])("rejects spoofed bytes without ready records: %s", async (value) => {
  expect((await send(Buffer.from(value))).status).toBe(400);
  expect(await db.asset.findMany()).toMatchObject([{ state: "FAILED" }]);
  expect(await db.catalogAsset.count()).toBe(0);
});
it("rejects invalid headers and mismatched declared length", async () => {
  expect(
    (await send(await image(), { "x-file-name": "photo.svg" })).status,
  ).toBe(400);
  expect(
    (await send(await image(), { "content-length": String(26 * 1024 * 1024) }))
      .status,
  ).toBe(413);
  expect((await send(await image(), { "content-length": "1" })).status).toBe(
    400,
  );
  expect(await db.catalogAsset.count()).toBe(0);
});
it("supports authorized ranges and HEAD without cache validators bypassing authorization", async () => {
  const bytes = await image();
  const dto = await (await send(bytes)).json();
  const id = dto.uploadId;
  const read = await privateMediaRequest(
    new Request("http://localhost:3002/", {
      headers: { ...Object.fromEntries(headers), range: "bytes=0-15" },
    }),
    id,
  );
  expect(read.status).toBe(206);
  expect(Buffer.from(await read.arrayBuffer())).toEqual(bytes.subarray(0, 16));
  expect(read.headers.get("content-range")).toBe(`bytes 0-15/${bytes.length}`);
  const head = await privateMediaRequest(
    new Request("http://localhost:3002/", { method: "HEAD", headers }),
    id,
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(
    (
      await privateMediaRequest(
        new Request("http://localhost:3002/", {
          headers: { ...Object.fromEntries(headers), range: "bytes=9999999-" },
        }),
        id,
      )
    ).status,
  ).toBe(416);
  await db.accessGrant.update({
    where: { id: grantId },
    data: { enabled: false },
  });
  expect(
    (
      await privateMediaRequest(
        new Request("http://localhost:3002/", { headers }),
        id,
      )
    ).status,
  ).toBe(403);
});
it("recovers unknown storage outcomes and concurrent completion without duplicating uses", async () => {
  const context = await requirePrivateAccess(headers);
  let count = 0;
  let id = "";
  const uncertain = {
    ...storage,
    put: async (input: Parameters<typeof storage.put>[0]) => {
      await storage.put(input);
      if (++count === 3) throw new StorageError("UNAVAILABLE");
      return { sizeBytes: input.sizeBytes };
    },
  };
  try {
    await uploadAsset(
      context,
      {
        target: target(),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      uncertain,
    );
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  expect(id).not.toBe("");
  expect(await db.asset.findMany()).toHaveLength(3);
  expect((await db.asset.findMany()).every((a) => a.state === "PENDING")).toBe(
    true,
  );
  expect(await db.catalogAsset.count()).toBe(0);
  const [a, b] = await Promise.all([
    completeUpload(context, id, signal(), storage),
    completeUpload(context, id, signal(), storage),
  ]);
  expect(a).toEqual(b);
  expect(await db.catalogAsset.count()).toBe(1);
});
it("keeps an incomplete upload pending and inaccessible", async () => {
  const context = await requirePrivateAccess(headers);
  let id = "";
  const failing = {
    ...storage,
    put: async () => {
      throw new StorageError("UNAVAILABLE");
    },
  };
  try {
    await uploadAsset(
      context,
      {
        target: target(),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      failing,
    );
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  expect(
    (
      await privateMediaRequest(
        new Request("http://localhost:3002/", { headers }),
        id,
      )
    ).status,
  ).toBe(404);
  await expect(
    completeUpload(context, id, signal(), storage),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await db.catalogAsset.count()).toBe(0);
});
it("blocks deletion of referenced files and thumbnail families, then retries failed removal", async () => {
  const dto = await (await send(await image())).json();
  const context = await requirePrivateAccess(headers);
  for (const file of dto.files)
    await expect(
      deleteUnusedAsset(context, file.id, storage),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  await db.catalogAsset.deleteMany();
  const failed = {
    ...storage,
    remove: async () => {
      throw new StorageError("UNAVAILABLE");
    },
  };
  await expect(
    deleteUnusedAsset(context, dto.files[1].id, failed),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(
    (await db.asset.findUnique({ where: { id: dto.files[1].id } }))?.state,
  ).toBe("DELETING");
  await deleteUnusedAsset(context, dto.files[1].id, storage);
  await deleteUnusedAsset(context, dto.files[2].id, storage);
  await deleteUnusedAsset(context, dto.uploadId, storage);
  await deleteUnusedAsset(context, dto.uploadId, storage);
  expect(await db.asset.count()).toBe(0);
});
it("enforces immutable bytes, fixed lineage, READY-only attachment and original publication exclusion", async () => {
  const dto = await (await send(await image())).json();
  const originalId = dto.uploadId;
  const displayId = dto.files[2].id;
  await expect(
    db.asset.update({
      where: { id: displayId },
      data: { sha256: "f".repeat(64) },
    }),
  ).rejects.toThrow();
  await expect(
    db.asset.update({ where: { id: originalId }, data: { state: "PENDING" } }),
  ).rejects.toThrow();
  await expect(
    db.assetDependency.deleteMany({ where: { derivedAssetId: displayId } }),
  ).rejects.toThrow();
  await expect(
    db.asset.update({ where: { id: originalId }, data: { state: "DELETING" } }),
  ).rejects.toThrow();
  await expect(
    db.asset.update({
      where: { id: originalId },
      data: {
        publicSafe: true,
        rightsStatus: "APPROVED",
        reviewedAt: new Date(),
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.catalogAsset.update({
      where: { id: dto.useId },
      data: {
        publicDisplayAssetId: displayId,
        publicApproved: true,
        approvedAt: new Date(),
      },
    }),
  ).rejects.toThrow();
  const id = randomUUID();
  await db.asset.create({
    data: {
      id,
      kind: "IMAGE",
      scope: "CATALOG",
      ...createObjectLocator(id, "image/png"),
    },
  });
  await expect(
    db.catalogAsset.create({ data: { companyId, role: "LOGO", assetId: id } }),
  ).rejects.toThrow();
  await expect(
    db.asset.update({ where: { id }, data: { state: "READY" } }),
  ).rejects.toThrow();
});
it("retains bytes when the uploader account is deleted", async () => {
  const dto = await (await send(await image())).json();
  await db.user.delete({ where: { id: userId } });
  expect(
    (await db.asset.findMany()).every((a) => a.uploadedById === null),
  ).toBe(true);
  expect(
    await storage.stat(
      (await db.asset.findUnique({ where: { id: dto.uploadId } }))!,
    ),
  ).not.toBeNull();
});
it.each(["png", "webp", "avif"] as const)(
  "decodes real %s files and creates bounded display derivatives",
  async (format) => {
    const bytes = await sharp({
      create: { width: 1800, height: 900, channels: 3, background: "blue" },
    })
      .toFormat(format)
      .toBuffer();
    const response = await send(bytes, {
      "content-type": `image/${format}`,
      "x-file-name": `photo.${format}`,
    });
    expect(response.status).toBe(201);
    const dto = await response.json();
    expect(dto.files[1]).toMatchObject({ width: 320, height: 160 });
    expect(dto.files[2]).toMatchObject({ width: 1600, height: 800 });
  },
);
it("allows editor collection photos while application logos require admin permission", async () => {
  const platform = await db.consolePlatform.create({
    data: { name: "Fixture platform", slug: randomUUID() },
  });
  const model = await db.consoleModel.create({
    data: {
      name: "Fixture model",
      slug: randomUUID(),
      platformId: platform.id,
    },
  });
  const item = await db.$transaction(async (tx) => {
    const root = await tx.collectionItem.create({ data: { type: "CONSOLE" } });
    await tx.ownedConsole.create({
      data: { collectionItemId: root.id, consoleModelId: model.id },
    });
    return root;
  });
  await db.accessGrant.update({
    where: { id: grantId },
    data: { role: "EDITOR" },
  });
  const response = await send(await image(), {
    "x-gemukore-target": JSON.stringify({
      kind: "collection",
      id: item.id,
      type: "CUSTOM_LOGO",
    }),
  });
  expect(response.status).toBe(201);
  expect(await db.collectionItemMedia.findMany()).toMatchObject([
    { collectionItemId: item.id, type: "CUSTOM_LOGO", publicApproved: false },
  ]);
  expect(
    await send(await image(), {
      "x-gemukore-target": JSON.stringify({
        kind: "application",
        role: "COLLECTION_LOGO",
      }),
    }),
  ).toMatchObject({ status: 403 });
  await db.accessGrant.update({
    where: { id: grantId },
    data: { role: "ADMIN" },
  });
  expect(
    await send(await image(), {
      "x-gemukore-target": JSON.stringify({
        kind: "application",
        role: "COLLECTION_LOGO",
      }),
    }),
  ).toMatchObject({ status: 201 });
  await db.appAsset.deleteMany();
});
it("uploads GLB as a private console model without inventing a publishable derivative", async () => {
  const platform = await db.consolePlatform.create({
    data: { name: "GLB platform", slug: randomUUID() },
  });
  const model = await db.consoleModel.create({
    data: { name: "GLB model", slug: randomUUID(), platformId: platform.id },
  });
  const raw = Buffer.from(
    JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], scene: 0 }),
  );
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 32),
  ]);
  const bytes = Buffer.alloc(20 + json.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  const response = await send(bytes, {
    "content-type": "model/gltf-binary",
    "x-file-name": "model.glb",
    "x-gemukore-target": JSON.stringify({
      kind: "catalog",
      target: "consoleModel",
      id: model.id,
      role: "MODEL_3D",
    }),
  });
  expect(response.status).toBe(201);
  expect((await response.json()).files).toHaveLength(1);
  expect(await db.asset.findMany()).toMatchObject([
    { kind: "MODEL_3D", deliveryClass: "ORIGINAL", publicSafe: false },
  ]);
});
it("reviews display bytes independently from original safety and resets changed use approval", async () => {
  const dto = await (await send(await image())).json();
  const display = dto.files[2].id;
  await db.asset.update({
    where: { id: dto.uploadId },
    data: { rightsStatus: "APPROVED", reviewedAt: new Date() },
  });
  await db.asset.update({
    where: { id: display },
    data: {
      rightsStatus: "APPROVED",
      publicSafe: true,
      reviewedAt: new Date(),
    },
  });
  await db.catalogAsset.update({
    where: { id: dto.useId },
    data: { publicDisplayAssetId: display },
  });
  await db.catalogAsset.update({
    where: { id: dto.useId },
    data: {
      publicApproved: true,
      approvedAt: new Date(),
      approvedById: userId,
    },
  });
  expect(
    (await db.asset.findUnique({ where: { id: dto.uploadId } }))?.publicSafe,
  ).toBe(false);
  await db.catalogAsset.update({
    where: { id: dto.useId },
    data: { caption: "changed content", publicApproved: true },
  });
  expect(
    await db.catalogAsset.findUnique({ where: { id: dto.useId } }),
  ).toMatchObject({ publicApproved: false, approvedAt: null });
  await db.asset.update({
    where: { id: dto.uploadId },
    data: { rightsStatus: "RESTRICTED" },
  });
  const rows = await db.$queryRaw<
    { eligible: boolean }[]
  >`SELECT asset_public_eligible(${display}::uuid) AS eligible`;
  expect(rows[0].eligible).toBe(false);
});
it("rechecks a revoked role before finalization and leaves uploaded bytes pending", async () => {
  const context = await requirePrivateAccess(headers);
  let count = 0;
  const revoking = {
    ...storage,
    put: async (input: Parameters<typeof storage.put>[0]) => {
      const result = await storage.put(input);
      if (++count === 3)
        await db.accessGrant.update({
          where: { id: grantId },
          data: { role: "EDITOR" },
        });
      return result;
    },
  };
  await expect(
    uploadAsset(
      context,
      {
        target: target(),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      revoking,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await db.asset.findMany()).every((a) => a.state === "PENDING")).toBe(
    true,
  );
  expect(await db.catalogAsset.count()).toBe(0);
});
it("rejects corrupted stored bytes during recovery without making any asset READY", async () => {
  const context = await requirePrivateAccess(headers);
  let count = 0;
  let id = "";
  const uncertain = {
    ...storage,
    put: async (input: Parameters<typeof storage.put>[0]) => {
      const result = await storage.put(input);
      if (++count === 3) throw new StorageError("UNAVAILABLE");
      return result;
    },
  };
  try {
    await uploadAsset(
      context,
      {
        target: target(),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      uncertain,
    );
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  const original = (await db.asset.findUnique({ where: { id } }))!;
  const wrong = Buffer.alloc(Number(original.sizeBytes), 0);
  await storage.put({
    locator: original,
    contentType: "image/jpeg",
    sizeBytes: wrong.length,
    openBody: () => Readable.from([wrong]),
    metadata: {
      assetId: id,
      sha256: createHash("sha256").update(wrong).digest("hex"),
    },
  });
  await expect(
    completeUpload(context, id, signal(), storage),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await db.asset.findMany()).every((a) => a.state === "PENDING")).toBe(
    true,
  );
});
it("serializes reference attachment against a deletion claim in both orders", async () => {
  async function file() {
    const id = randomUUID();
    return db.asset.create({
      data: {
        id,
        kind: "IMAGE",
        scope: "CATALOG",
        state: "READY",
        mimeType: "image/png",
        sizeBytes: 1,
        sha256: "a".repeat(64),
        width: 1,
        height: 1,
        ...createObjectLocator(id, "image/png"),
      },
    });
  }
  const a = await file();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attached!: () => void;
  const inserted = new Promise<void>((resolve) => {
    attached = resolve;
  });
  const use = db.$transaction(async (tx) => {
    await tx.catalogAsset.create({
      data: { companyId, role: "LOGO", assetId: a.id },
    });
    attached();
    await gate;
  });
  await inserted;
  const claim = db.asset.update({
    where: { id: a.id },
    data: { state: "DELETING" },
  });
  const asserted = expect(claim).rejects.toThrow();
  // Allow the competing statement to wait on the use's asset lock.
  await new Promise((resolve) => setTimeout(resolve, 30));
  release();
  await use;
  await asserted;
  expect((await db.asset.findUnique({ where: { id: a.id } }))?.state).toBe(
    "READY",
  );
  const b = await file();
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  let claimed!: () => void;
  const deleting = new Promise<void>((resolve) => {
    claimed = resolve;
  });
  const first = db.$transaction(async (tx) => {
    await tx.asset.update({ where: { id: b.id }, data: { state: "DELETING" } });
    claimed();
    await deleteGate;
  });
  await deleting;
  const attach = expect(
    db.catalogAsset.create({
      data: { companyId, role: "LOGO", assetId: b.id },
    }),
  ).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 30));
  releaseDelete();
  await first;
  await attach;
  expect((await db.asset.findUnique({ where: { id: b.id } }))?.state).toBe(
    "DELETING",
  );
});
it("returns a singleton logo conflict without overwriting the earlier application use", async () => {
  const options = {
    "x-gemukore-target": JSON.stringify({
      kind: "application",
      role: "COLLECTION_LOGO",
    }),
  };
  const first = await send(await image(), options);
  expect(first.status).toBe(201);
  const firstDto = await first.json();
  const second = await send(await image(), options);
  expect(second.status).toBe(409);
  expect(await db.appAsset.findMany()).toMatchObject([{ id: firstDto.useId }]);
  await db.appAsset.deleteMany();
});
it("revokes display licensing independently from its byte-content safety review", async () => {
  const dto = await (await send(await image())).json();
  const display = dto.files[2].id;
  await db.asset.update({
    where: { id: dto.uploadId },
    data: { rightsStatus: "APPROVED", reviewedAt: new Date() },
  });
  await db.asset.update({
    where: { id: display },
    data: {
      rightsStatus: "APPROVED",
      publicSafe: true,
      reviewedAt: new Date(),
    },
  });
  await db.asset.update({
    where: { id: display },
    data: { rightsStatus: "RESTRICTED" },
  });
  expect(
    (await db.asset.findUnique({ where: { id: display } }))?.publicSafe,
  ).toBe(true);
  const rows = await db.$queryRaw<
    { eligible: boolean }[]
  >`SELECT asset_public_eligible(${display}::uuid) AS eligible`;
  expect(rows[0].eligible).toBe(false);
});
it("returns the existing completion when another request commits during verification", async () => {
  const context = await requirePrivateAccess(headers);
  let count = 0;
  let id = "";
  const uncertain = {
    ...storage,
    put: async (input: Parameters<typeof storage.put>[0]) => {
      const result = await storage.put(input);
      if (++count === 3) throw new StorageError("UNAVAILABLE");
      return result;
    },
  };
  try {
    await uploadAsset(
      context,
      {
        target: target(),
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      uncertain,
    );
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let reads = 0;
  const delayed = {
    ...storage,
    get: async (...args: Parameters<typeof storage.get>) => {
      if (++reads === 1) {
        reached();
        await gate;
      }
      return storage.get(...args);
    },
  };
  const slow = completeUpload(context, id, signal(), delayed);
  await entered;
  const fast = await completeUpload(context, id, signal(), storage);
  release();
  expect(await slow).toEqual(fast);
  expect(await db.catalogAsset.count()).toBe(1);
});
it.each(["constructor", "toString", "__proto__"])(
  "rejects inherited MIME name %s at the authenticated upload boundary",
  async (mime) => {
    const response = await send(await image(), { "content-type": mime });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The file or upload details are invalid.",
    });
    expect(await db.asset.count()).toBe(0);
  },
);
it("persists only the normalized filename and omits it from object keys, DTOs and download headers", async () => {
  const source = "C:\\private-owner\\photos\\Cafe\u0301.JPEG";
  const response = await send(await image(), {
    "x-file-name": encodeURIComponent(source),
  });
  expect(response.status).toBe(201);
  const text = await response.text();
  expect(text).not.toContain("private-owner");
  expect(text).not.toContain("Café");
  const dto = JSON.parse(text);
  const original = (await db.asset.findUnique({
    where: { id: dto.uploadId },
  }))!;
  expect(original.originalFilename).toBe("Café.JPEG");
  expect(original.objectKey).not.toContain("Café");
  const head = await privateMediaRequest(
    new Request("http://localhost:3002/", { method: "HEAD", headers }),
    dto.uploadId,
  );
  expect(head.status).toBe(200);
  expect(head.headers.get("content-disposition")).toBe(
    'attachment; filename="asset.jpeg"',
  );
});

it("appends collection photos in order, advances revision once and resolves authenticated thumbnails", async () => {
  const { getMediaManagement, mutateMedia } =
    await import("@/server/services/collection/media");
  const context = await requirePrivateAccess(headers);
  const platform = await db.consolePlatform.create({
    data: { name: "SNES", slug: randomUUID() },
  });
  const model = await db.consoleModel.create({
    data: {
      name: "Super Nintendo",
      platformId: platform.id,
      slug: randomUUID(),
    },
  });
  const item = await db.collectionItem.create({
    data: {
      type: "CONSOLE",
      ownedConsole: { create: { consoleModelId: model.id } },
    },
  });
  const upload = async (type: string) =>
    uploadAsset(
      context,
      {
        target: { kind: "collection", id: item.id, type },
        mimeType: "image/jpeg",
        filename: "photo.jpg",
        body: body(await image()),
      },
      signal(),
      storage,
    );
  const a = await upload("FRONT");
  const b = await upload("BOX");
  expect(
    await db.collectionItem.findUnique({ where: { id: item.id } }),
  ).toMatchObject({ revision: 3, updatedById: userId });
  expect(
    (
      await db.collectionItemMedia.findMany({
        where: { collectionItemId: item.id },
        orderBy: { sortOrder: "asc" },
      })
    ).map((row) => row.id),
  ).toEqual([a.useId, b.useId]);
  await completeUpload(context, a.uploadId, signal(), storage);
  const management = await getMediaManagement(context, item.id);
  expect(management.selected?.revision).toBe(3);
  expect(management.photos.map((photo) => photo.type)).toEqual([
    "FRONT",
    "BOX",
  ]);
  expect(management.photos[0].thumbnailUrl).toBe(
    a.files.find((file) => file.variant === "thumbnail")?.url,
  );
  expect(management.photos[0].displayUrl).toBe(
    a.files.find((file) => file.variant === "display")?.url,
  );
  await mutateMedia(context, {
    operation: "delete",
    collectionItemId: item.id,
    expectedRevision: 3,
    id: a.useId,
  });
  expect(await db.asset.count()).toBe(6);
  expect(await db.assetDependency.count()).toBe(4);
  expect(
    (
      await privateMediaRequest(
        new Request("http://localhost:3002" + a.files[2].url, { headers }),
        a.files[2].id,
      )
    ).status,
  ).toBe(200);
});
it("records UTF-8 screenshot provenance on the image family and advances the release exactly once", async () => {
  const platform = await db.consolePlatform.create({
    data: { name: "SNES", slug: randomUUID() },
  });
  const game = await db.game.create({
    data: { name: "Game", slug: randomUUID() },
  });
  const release = await db.gameRelease.create({
    data: { gameId: game.id, platformId: platform.id, slug: randomUUID() },
  });
  const { emptyScreenshotUpload } =
    await import("@/features/games/screenshot-validation");
  const screenshot = {
    ...emptyScreenshotUpload,
    caption: "森",
    author: "山田",
    sourceUrl: "https://example.com/scene",
    sourceType: "CURATED",
    retrievedAt: "2024-02-29",
  };
  const bytes = await image();
  const response = await send(bytes, {
    "x-gemukore-target": encodeURIComponent(
      JSON.stringify({
        kind: "catalog",
        target: "gameRelease",
        id: release.id,
        role: "SCREENSHOT",
        screenshot,
      }),
    ),
  });
  expect(response.status).toBe(201);
  const result = await response.json();
  const rows = await db.asset.findMany();
  expect(rows).toHaveLength(3);
  for (const row of rows)
    expect(row).toMatchObject({
      sourceType: "CURATED",
      author: "山田",
      sourceUrl: "https://example.com/scene",
      rightsStatus: "UNKNOWN",
      publicSafe: false,
      retrievedAt: new Date("2024-02-29T00:00:00Z"),
    });
  expect(
    await db.catalogAsset.findUnique({ where: { id: result.useId } }),
  ).toMatchObject({
    gameReleaseId: release.id,
    role: "SCREENSHOT",
    caption: "森",
    sortOrder: 0,
    publicApproved: false,
  });
  const context = await requirePrivateAccess(headers);
  await completeUpload(context, result.uploadId, signal(), storage);
  expect(
    await db.gameRelease.findUnique({ where: { id: release.id } }),
  ).toMatchObject({ revision: 2 });
  expect(
    await db.metadataChange.count({ where: { gameReleaseId: release.id } }),
  ).toBe(1);
});

import { switchFixture } from "../helpers/switch-fixture";
import { dvdFixture } from "../helpers/dvd-fixture";
import { jewelFixture } from "../helpers/jewel-fixture";
import {
  authoredFamily,
  type AuthoredFamily,
} from "@/lib/three/packaging-contracts";
import { clamshellFixture } from "../helpers/clamshell-fixture";
import { emptyScreenshotUpload } from "@/features/games/screenshot-validation";
import {
  createPackagingTemplate,
  changePackagingTemplate,
} from "@/server/services/catalog/physical-editions";
async function geometryDraft(familyKey: AuthoredFamily = "genesis-clamshell") {
  const context = await requirePrivateAccess(headers),
    fixture =
      familyKey === "switch-case"
        ? switchFixture()
        : familyKey === "ps2-dvd"
          ? dvdFixture()
          : familyKey === "playstation-jewel"
            ? jewelFixture()
            : clamshellFixture();
  const draft = {
    id: randomUUID(),
    name: `Original synthetic ${familyKey}`,
    slug: randomUUID(),
    familyKey,
    revisionNumber: 1,
    synthetic: true,
    measurementNote: "Original synthetic fixture; no retail measurements",
    dimensions: fixture.dimensions,
    slots: fixture.slots,
  };
  await createPackagingTemplate(context, draft);
  const target = {
    kind: "packagingGeometry",
    id: draft.id,
    expectedRevision: 1,
    source: {
      ...emptyScreenshotUpload,
      provider: "Original test fixture",
      licenseName: "Test author permission",
    },
  };
  const input = {
    target,
    mimeType: "model/gltf-binary",
    filename: "original-clamshell.glb",
    body: body(fixture.bytes),
    declaredSize: fixture.bytes.length,
  };
  return { context, fixture, draft, target, input };
}
it.each(authoredFamily.options)(
  "attaches %s v2 geometry directly, preserves source, retries once, approves and protects the ready model",
  async (familyKey) => {
    const { context, draft, input } = await geometryDraft(familyKey);
    const result = await uploadAsset(context, input, signal(), storage);
    expect(result.useId).toBeUndefined();
    expect(result.templateId).toBe(draft.id);
    const model = await db.asset.findUniqueOrThrow({
      where: { id: result.uploadId },
    });
    expect(model).toMatchObject({
      state: "READY",
      kind: "MODEL_3D",
      scope: "CATALOG",
      publicSafe: false,
      rightsStatus: "UNKNOWN",
      provider: "Original test fixture",
      licenseName: "Test author permission",
      metadata: { schemaVersion: 2 },
    });
    expect(await db.catalogAsset.count()).toBe(0);
    expect(
      await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({
      baseModelAssetId: result.uploadId,
      revision: 2,
      status: "DRAFT",
    });
    await Promise.all([
      completeUpload(context, result.uploadId, signal(), storage),
      completeUpload(context, result.uploadId, signal(), storage),
    ]);
    expect(
      await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({ revision: 2 });
    await expect(
      changePackagingTemplate(context, {
        id: draft.id,
        expectedRevision: 2,
        operation: "ready",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await changePackagingTemplate(context, {
      id: draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    });
    expect(
      await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({ revision: 3, status: "READY" });
    await expect(
      deleteUnusedAsset(context, result.uploadId, storage),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      db.asset.update({
        where: { id: result.uploadId },
        data: { state: "DELETING" },
      }),
    ).rejects.toThrow();
    await expect(
      db.packagingTemplate.update({
        where: { id: draft.id },
        data: { baseModelAssetId: null },
      }),
    ).rejects.toThrow();
    await completeUpload(context, result.uploadId, signal(), storage);
    await expect(
      uploadAsset(
        context,
        {
          ...input,
          body: body(clamshellFixture().bytes),
          target: { ...input.target, expectedRevision: 3 },
        },
        signal(),
        storage,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  },
);
it("completes a stored but unconfirmed model concurrently without duplicate attachments", async () => {
  const { context, draft, input } = await geometryDraft();
  let id = "";
  const interrupted = {
    ...storage,
    put: async (value: Parameters<typeof storage.put>[0]) => {
      await storage.put(value);
      throw new StorageError("UNAVAILABLE");
    },
  };
  try {
    await uploadAsset(context, input, signal(), interrupted);
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  expect(id).toBeTruthy();
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ revision: 1, baseModelAssetId: null });
  const results = await Promise.all([
    completeUpload(context, id, signal(), storage),
    completeUpload(context, id, signal(), storage),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ revision: 2, baseModelAssetId: id });
});
it("rechecks draft revision and current authority after storage, and supports deliberate draft replacement", async () => {
  const { context, draft, input } = await geometryDraft();
  let id = "";
  try {
    await uploadAsset(context, input, signal(), {
      ...storage,
      put: async (value: Parameters<typeof storage.put>[0]) => {
        await storage.put(value);
        throw new StorageError("UNAVAILABLE");
      },
    });
  } catch (error) {
    id = (error as { uploadId: string }).uploadId;
  }
  await db.accessGrant.update({
    where: { id: grantId },
    data: { role: "EDITOR" },
  });
  await expect(
    completeUpload(context, id, signal(), storage),
  ).rejects.toThrow();
  await db.accessGrant.update({
    where: { id: grantId },
    data: { role: "ADMIN" },
  });
  await changePackagingTemplate(context, {
    id: draft.id,
    expectedRevision: 1,
    operation: "archive",
  });
  await expect(
    completeUpload(context, id, signal(), storage),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await changePackagingTemplate(context, {
    id: draft.id,
    expectedRevision: 2,
    operation: "restore",
  });
  await expect(
    completeUpload(context, id, signal(), storage),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const a = await uploadAsset(
    context,
    {
      ...input,
      body: body(clamshellFixture().bytes),
      target: { ...input.target, expectedRevision: 3 },
    },
    signal(),
    storage,
  );
  const b = await uploadAsset(
    context,
    {
      ...input,
      body: body(clamshellFixture().bytes),
      target: { ...input.target, expectedRevision: 4 },
    },
    signal(),
    storage,
  );
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ revision: 5, baseModelAssetId: b.uploadId });
  await deleteUnusedAsset(context, a.uploadId, storage);
});
it("rejects geometry dimensions/UV drift before readiness and actual oversize streams before decoding", async () => {
  const { context, draft, input, fixture } = await geometryDraft();
  const bad = buildGlb(
    {
      ...fixture.document,
      nodes: fixture.document.nodes.map((n, i) =>
        i === 0 ? { ...n, name: "drift" } : n,
      ),
    },
    fixture.binary,
  );
  await uploadAsset(
    context,
    { ...input, body: body(bad), declaredSize: bad.length },
    signal(),
    storage,
  );
  await expect(
    changePackagingTemplate(context, {
      id: draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ status: "DRAFT", revision: 2 });
  await expect(
    uploadAsset(
      context,
      {
        ...input,
        target: { ...input.target, expectedRevision: 2 },
        declaredSize: undefined,
        body: body(Buffer.alloc(8 * 1024 * 1024 + 1)),
      },
      signal(),
      storage,
    ),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
});
import { buildGlb } from "../helpers/model-fixture";
it("rejects a transparent jewel art target at approval while preserving its draft and compatible Genesis template", async () => {
  const legacy = await geometryDraft();
  await uploadAsset(legacy.context, legacy.input, signal(), storage);
  await changePackagingTemplate(legacy.context, {
    id: legacy.draft.id,
    expectedRevision: 2,
    operation: "ready",
    reviewedGeometry: true,
  });
  const { context, draft, input, fixture } =
    await geometryDraft("playstation-jewel");
  fixture.document.materials[0].alphaMode = "BLEND";
  fixture.document.materials[0].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  const bytes = buildGlb(fixture.document, fixture.binary);
  await uploadAsset(
    context,
    { ...input, body: body(bytes), declaredSize: bytes.length },
    signal(),
    storage,
  );
  await expect(
    changePackagingTemplate(context, {
      id: draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ status: "DRAFT", revision: 2 });
  expect(
    await db.packagingTemplate.findUnique({ where: { id: legacy.draft.id } }),
  ).toMatchObject({
    status: "READY",
    revision: 3,
    familyKey: "genesis-clamshell",
  });
});
it("requires opaque DVD housing before approval and preserves a draft after an incompatible upload", async () => {
  const { context, draft, input } = await geometryDraft("ps2-dvd"),
    f = dvdFixture();
  f.document.materials[3].alphaMode = "BLEND";
  f.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  const bytes = buildGlb(f.document, f.binary);
  await uploadAsset(
    context,
    { ...input, body: body(bytes), declaredSize: bytes.length },
    signal(),
    storage,
  );
  await expect(
    changePackagingTemplate(context, {
      id: draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ status: "DRAFT", revision: 2 });
});

it("rejects translucent Switch artwork during stored-byte approval and retains the private draft", async () => {
  const { context, draft, input } = await geometryDraft("switch-case"),
    f = switchFixture();
  // Isolate art-material validation from the eight-blended-primitive cap.
  f.document.materials[3].alphaMode = "OPAQUE";
  f.document.materials[3].pbrMetallicRoughness.baseColorFactor[3] = 1;
  f.document.materials[0].alphaMode = "BLEND";
  f.document.materials[0].pbrMetallicRoughness.baseColorFactor[3] = 0.2;
  const bytes = buildGlb(f.document, f.binary);
  await uploadAsset(
    context,
    { ...input, body: body(bytes), declaredSize: bytes.length },
    signal(),
    storage,
  );
  await expect(
    changePackagingTemplate(context, {
      id: draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.packagingTemplate.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ status: "DRAFT", revision: 2, familyKey: "switch-case" });
});

import { cartridgeFixture } from "../helpers/cartridge-fixture";
import {
  createPhysicalMediaTemplate,
  changePhysicalMediaTemplate,
} from "@/server/services/catalog/physical-media";
async function mediaDraft() {
  const context = await requirePrivateAccess(headers),
    fixture = cartridgeFixture();
  const draft = {
    id: randomUUID(),
    name: "Original synthetic cartridge",
    slug: randomUUID(),
    familyKey: "cartridge",
    type: "CARTRIDGE",
    revisionNumber: 1,
    synthetic: true,
    measurementNote: "Original synthetic study; not retail measurements",
    dimensions: fixture.dimensions,
    slots: fixture.slots,
  };
  await createPhysicalMediaTemplate(context, draft);
  const target = {
    kind: "physicalMediaGeometry",
    id: draft.id,
    expectedRevision: 1,
    source: {
      ...emptyScreenshotUpload,
      provider: "Original cartridge fixture",
      licenseName: "Test author permission",
    },
  };
  const input = {
    target,
    mimeType: "model/gltf-binary",
    filename: "original-cartridge.glb",
    body: body(fixture.bytes),
    declaredSize: fixture.bytes.length,
  };
  return { context, fixture, draft, target, input };
}
it("uploads private cartridge geometry directly, preserves provenance and retries before and after reviewed approval", async () => {
  const c = await mediaDraft(),
    result = await uploadAsset(c.context, c.input, signal(), storage);
  expect(result.useId).toBeUndefined();
  expect(result.templateId).toBe(c.draft.id);
  expect(await db.catalogAsset.count()).toBe(0);
  expect(await db.packagingTemplate.count()).toBe(0);
  expect(
    await db.asset.findUnique({ where: { id: result.uploadId } }),
  ).toMatchObject({
    state: "READY",
    kind: "MODEL_3D",
    scope: "CATALOG",
    publicSafe: false,
    provider: "Original cartridge fixture",
    licenseName: "Test author permission",
    metadata: { schemaVersion: 2 },
  });
  await Promise.all([
    completeUpload(c.context, result.uploadId, signal(), storage),
    completeUpload(c.context, result.uploadId, signal(), storage),
  ]);
  expect(
    await db.physicalMediaTemplate.findUnique({ where: { id: c.draft.id } }),
  ).toMatchObject({
    revision: 2,
    status: "DRAFT",
    baseModelAssetId: result.uploadId,
  });
  await expect(
    changePhysicalMediaTemplate(c.context, {
      id: c.draft.id,
      expectedRevision: 2,
      operation: "ready",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await changePhysicalMediaTemplate(c.context, {
    id: c.draft.id,
    expectedRevision: 2,
    operation: "ready",
    reviewedGeometry: true,
  });
  expect(
    await db.physicalMediaTemplate.findUnique({ where: { id: c.draft.id } }),
  ).toMatchObject({ revision: 3, status: "READY" });
  await completeUpload(c.context, result.uploadId, signal(), storage);
  await expect(
    deleteUnusedAsset(c.context, result.uploadId, storage),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    db.asset.update({
      where: { id: result.uploadId },
      data: { state: "DELETING" },
    }),
  ).rejects.toThrow();
  await expect(
    uploadAsset(
      c.context,
      {
        ...c.input,
        body: body(c.fixture.bytes),
        target: { ...c.target, expectedRevision: 3 },
      },
      signal(),
      storage,
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("validates stored cartridge label material before readiness and preserves incompatible private drafts", async () => {
  const c = await mediaDraft();
  c.fixture.document.materials[0].pbrMetallicRoughness.baseColorFactor[0] = 0.5;
  const bytes = buildGlb(c.fixture.document, c.fixture.binary);
  await uploadAsset(
    c.context,
    { ...c.input, body: body(bytes), declaredSize: bytes.length },
    signal(),
    storage,
  );
  await expect(
    changePhysicalMediaTemplate(c.context, {
      id: c.draft.id,
      expectedRevision: 2,
      operation: "ready",
      reviewedGeometry: true,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await db.physicalMediaTemplate.findUnique({ where: { id: c.draft.id } }),
  ).toMatchObject({ revision: 2, status: "DRAFT" });
});
it("bounds cartridge uploads and denies stale targets or revoked curators before attaching geometry", async () => {
  const c = await mediaDraft();
  await expect(
    uploadAsset(
      c.context,
      {
        ...c.input,
        body: body(c.fixture.bytes),
        declaredSize: 8 * 1024 * 1024 + 1,
      },
      signal(),
      storage,
    ),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
  await expect(
    uploadAsset(
      c.context,
      {
        ...c.input,
        body: body(c.fixture.bytes),
        target: { ...c.target, expectedRevision: 2 },
      },
      signal(),
      storage,
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await db.accessGrant.update({
    where: { id: grantId },
    data: { enabled: false },
  });
  await expect(
    uploadAsset(
      c.context,
      { ...c.input, body: body(c.fixture.bytes) },
      signal(),
      storage,
    ),
  ).rejects.toThrow();
  expect(
    await db.physicalMediaTemplate.findUnique({ where: { id: c.draft.id } }),
  ).toMatchObject({ revision: 1, baseModelAssetId: null });
});
it("replaces cartridge draft geometry explicitly and refuses stale completion of the old upload", async () => {
  const c = await mediaDraft(),
    first = await uploadAsset(c.context, c.input, signal(), storage);
  const second = await uploadAsset(
    c.context,
    {
      ...c.input,
      body: body(c.fixture.bytes),
      target: { ...c.target, expectedRevision: 2 },
    },
    signal(),
    storage,
  );
  expect(first.uploadId).not.toBe(second.uploadId);
  await expect(
    completeUpload(c.context, first.uploadId, signal(), storage),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await db.physicalMediaTemplate.findUnique({ where: { id: c.draft.id } }),
  ).toMatchObject({ revision: 3, baseModelAssetId: second.uploadId });
  await deleteUnusedAsset(c.context, first.uploadId, storage);
  await changePhysicalMediaTemplate(c.context, {
    id: c.draft.id,
    expectedRevision: 3,
    operation: "ready",
    reviewedGeometry: true,
  });
});
