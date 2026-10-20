import "server-only";
import { authoredFamily } from "@/lib/three/packaging-contracts";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { PrivateAccessError, type PrivateAccessContext } from "../auth/access";
import { PermissionError, requirePermission } from "../auth/permissions";
import { withTransaction, type TransactionClient } from "../db/transaction";
import { lockCatalogWrites } from "../repositories/catalog/management";
import { screenshotRelease } from "../repositories/catalog/screenshots";
import { recordScreenshotUpload } from "./catalog/screenshots";
import {
  findAsset,
  packagingGeometryIdentity,
  hasFamilyUses,
  hasReferences,
  insertAsset,
  lockAssets,
  makeReady,
  removeAssetRecord,
  targetIdentity,
  updateAsset,
} from "../repositories/assets";
import { getObjectStorage } from "../storage";
import { createObjectLocator } from "../storage/objects";
import type { ObjectStorage, StorageContentType } from "../storage/contracts";
import {
  AssetError,
  manifestSchema,
  targetSchema,
  type UploadManifest,
  type UploadTarget,
} from "../assets/contracts";
import {
  prepareUpload,
  uploadDescription,
  IMAGE_LIMIT,
  MODEL_LIMIT,
} from "../assets/processing";

import {
  lockCollectionItem,
  findCollectionItem,
  advanceCollectionItem,
} from "../repositories/collection/items";
let processing = false;
function catalogImageSource(target: UploadTarget) {
  const details =
    target.kind === "packagingGeometry"
      ? target.source
      : target.kind === "catalog"
        ? (target.screenshot ?? target.artwork)
        : null;
  if (!details) return {};
  const { caption, altText, retrievedAt, ...source } = details;
  void caption;
  void altText;
  return {
    ...source,
    retrievedAt: retrievedAt ? new Date(`${retrievedAt}T00:00:00Z`) : null,
  };
}
async function authorizeTarget(
  context: PrivateAccessContext,
  target: UploadTarget,
  kind: "IMAGE" | "MODEL_3D",
  tx: TransactionClient,
  completingId?: string,
) {
  const current = await requirePermission(
    context,
    target.kind === "catalog" || target.kind === "packagingGeometry"
      ? "catalog.manage"
      : target.kind === "application"
        ? "settings.manage"
        : "media.manage",
    tx,
  );
  if (target.kind === "packagingGeometry") {
    const identity = await packagingGeometryIdentity(target.id, tx);
    if (!identity) throw new AssetError("NOT_FOUND");
    if (
      !authoredFamily.safeParse(identity.familyKey).success ||
      identity.geometryType !== "GLB" ||
      kind !== "MODEL_3D"
    )
      throw new AssetError("INVALID_INPUT");
    const repeated =
      completingId &&
      identity.baseModelAssetId === completingId &&
      (await findAsset(completingId, tx))?.state === "READY";
    if (
      !repeated &&
      (identity.status !== "DRAFT" ||
        identity.archivedAt ||
        identity.revision !== target.expectedRevision)
    )
      throw new AssetError("CONFLICT");
    return current;
  }

  const identity = await targetIdentity(target, tx);
  if (!identity) throw new AssetError("NOT_FOUND");
  if (
    target.kind === "catalog" &&
    target.role === "SCREENSHOT" &&
    target.target === "gameRelease"
  ) {
    const release = await screenshotRelease(target.id, tx);
    if (!release || release.archivedAt) throw new AssetError("INVALID_INPUT");
  }
  const expectsModel =
    target.kind === "catalog"
      ? target.role === "MODEL_3D"
      : target.kind === "collection" && target.type === "CUSTOM_MODEL";
  if (expectsModel !== (kind === "MODEL_3D"))
    throw new AssetError("INVALID_INPUT");
  if (
    target.kind === "collection" &&
    "type" in identity &&
    ((target.type === "CUSTOM_LOGO" && identity.type !== "CONSOLE") ||
      (target.type === "CUSTOM_MODEL" && identity.type === "GAME"))
  )
    throw new AssetError("INVALID_INPUT");
  return current;
}
function result(manifest: UploadManifest) {
  return {
    uploadId: manifest.data.artifacts[0].id,
    useId: manifest.schemaVersion === 1 ? manifest.data.useId : undefined,
    ...(manifest.schemaVersion === 2
      ? { templateId: manifest.data.target.id }
      : {}),
    files: manifest.data.artifacts.map((a) => ({
      id: a.id,
      variant: a.variant,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      width: a.width,
      height: a.height,
      url: `/api/media/private/${a.id}`,
    })),
  };
}
function getManifest(metadata: unknown): UploadManifest {
  const parsed = manifestSchema.safeParse(metadata);
  if (!parsed.success) throw new AssetError("CONFLICT");
  const artifacts = parsed.data.data.artifacts;
  if (
    artifacts[0].variant !== "original" ||
    new Set(artifacts.map((a) => a.id)).size !== artifacts.length ||
    (artifacts.length !== 1 &&
      (artifacts.length !== 3 ||
        artifacts[1].variant !== "thumbnail" ||
        artifacts[2].variant !== "display"))
  )
    throw new AssetError("CONFLICT");
  return parsed.data;
}

// One admitted decoder per process. No background jobs, queues or open DB
// transactions while receiving, decoding, hashing or talking to object storage.
export async function uploadAsset(
  context: PrivateAccessContext,
  input: {
    target: unknown;
    mimeType: string | null;
    filename: string | null;
    body: ReadableStream<Uint8Array> | null;
    declaredSize?: number;
  },
  signal: AbortSignal,
  storage: ObjectStorage = getObjectStorage(),
) {
  const target = targetSchema.safeParse(input.target);
  if (!target.success || !input.body) throw new AssetError("INVALID_INPUT");
  const description = uploadDescription(input.mimeType, input.filename);
  if (
    input.declaredSize !== undefined &&
    (!Number.isSafeInteger(input.declaredSize) ||
      input.declaredSize <= 0 ||
      input.declaredSize >
        (target.data.kind === "packagingGeometry"
          ? 8 * 1024 * 1024
          : description.kind === "IMAGE"
            ? IMAGE_LIMIT
            : MODEL_LIMIT))
  )
    throw new AssetError("TOO_LARGE");
  const actor = await withTransaction((tx) =>
    authorizeTarget(context, target.data, description.kind, tx),
  );
  if (processing) throw new AssetError("BUSY");
  processing = true;
  const id = randomUUID();
  let reserved = false;
  let prepared: Awaited<ReturnType<typeof prepareUpload>> | undefined;
  try {
    await withTransaction(async (tx) => {
      await authorizeTarget(context, target.data, description.kind, tx);
      await insertAsset(
        {
          id,
          kind: description.kind,
          scope:
            target.data.kind === "catalog" ||
            target.data.kind === "packagingGeometry"
              ? "CATALOG"
              : "COLLECTION",
          ...createObjectLocator(id, description.mimeType),
          originalFilename: description.filename,
          uploadedById: actor.userId,
          ...catalogImageSource(target.data),
        },
        tx,
      );
    });
    reserved = true;
    try {
      prepared = await prepareUpload(
        input.body,
        description,
        id,
        signal,
        target.data.kind === "packagingGeometry"
          ? 8 * 1024 * 1024
          : MODEL_LIMIT,
      );
      if (
        target.data.kind === "packagingGeometry" &&
        prepared.artifacts[0].sizeBytes > 8 * 1024 * 1024
      )
        throw new AssetError("TOO_LARGE");
      if (
        input.declaredSize !== undefined &&
        input.declaredSize !== prepared.artifacts[0].sizeBytes
      )
        throw new AssetError("INVALID_INPUT");
    } catch (error) {
      await withTransaction(async (tx) => {
        await lockAssets([id], tx);
        const asset = await findAsset(id, tx);
        if (asset?.state === "PENDING")
          await updateAsset(id, { state: "FAILED" }, tx);
      });
      throw error;
    }
    const artifactEntries = prepared.artifacts.map((entry) => ({
      id: entry.id,
      variant: entry.variant,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
      ...(entry.width ? { width: entry.width, height: entry.height } : {}),
    }));
    if (
      target.data.kind === "packagingGeometry" &&
      (artifactEntries.length !== 1 ||
        artifactEntries[0].sizeBytes > 8 * 1024 * 1024)
    )
      throw new AssetError("TOO_LARGE");
    const manifest: UploadManifest =
      target.data.kind === "packagingGeometry"
        ? manifestSchema.parse({
            schemaVersion: 2,
            data: { target: target.data, artifacts: artifactEntries },
          })
        : {
            schemaVersion: 1,
            data: {
              target: target.data as Exclude<
                UploadTarget,
                { kind: "packagingGeometry" }
              >,
              useId: randomUUID(),
              artifacts: prepared.artifacts.map((entry) => ({
                id: entry.id,
                variant: entry.variant,
                mimeType: entry.mimeType,
                sizeBytes: entry.sizeBytes,
                sha256: entry.sha256,
                ...(entry.width
                  ? { width: entry.width, height: entry.height }
                  : {}),
              })),
            },
          };
    await withTransaction(async (tx) => {
      await authorizeTarget(context, target.data, description.kind, tx);
      await lockAssets([id], tx);
      if ((await findAsset(id, tx))?.state !== "PENDING")
        throw new AssetError("CONFLICT");
      for (const artifact of manifest.data.artifacts) {
        const data = {
          mimeType: artifact.mimeType,
          sizeBytes: BigInt(artifact.sizeBytes),
          sha256: artifact.sha256,
          width: artifact.width,
          height: artifact.height,
        };
        if (artifact.id === id)
          await updateAsset(id, { ...data, metadata: manifest }, tx);
        else
          await insertAsset(
            {
              ...data,
              id: artifact.id,
              kind: "IMAGE",
              scope:
                target.data.kind === "catalog" ||
                target.data.kind === "packagingGeometry"
                  ? "CATALOG"
                  : "COLLECTION",
              deliveryClass: "DISPLAY",
              ...createObjectLocator(artifact.id, artifact.mimeType),
              uploadedById: actor.userId,
              ...catalogImageSource(target.data),
              transformMetadata: {
                schemaVersion: 1,
                data: {
                  variant: artifact.variant,
                  processor: "sharp-0.35.5",
                  autoOrient: true,
                  strippedMetadata: true,
                },
              },
            },
            tx,
          );
      }
    });
    for (const artifact of prepared.artifacts) {
      const asset = await findAsset(artifact.id);
      if (!asset || asset.state !== "PENDING") throw new AssetError("CONFLICT");
      await storage.put({
        locator: asset,
        openBody: () => createReadStream(artifact.path),
        contentType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        metadata: { assetId: artifact.id, sha256: artifact.sha256 },
        signal,
      });
    }
    return await completeUpload(context, id, signal, storage);
  } catch (error) {
    if (error instanceof AssetError)
      throw new AssetError(error.code, reserved ? id : undefined);
    if (error instanceof PrivateAccessError || error instanceof PermissionError)
      throw error;
    // Storage outcomes may be unknown: retain PENDING and its fixed manifest.
    // Explicit completion verifies actual bytes; no blind READY on a retry.
    throw new AssetError("UNAVAILABLE", reserved ? id : undefined);
  } finally {
    try {
      await prepared?.cleanup();
    } finally {
      processing = false;
    }
  }
}

export async function completeUpload(
  context: PrivateAccessContext,
  id: string,
  signal: AbortSignal,
  storage: ObjectStorage = getObjectStorage(),
) {
  if (!z.uuid().safeParse(id).success) throw new AssetError("NOT_FOUND");
  await requirePermission(context, "media.manage");
  const original = await findAsset(id);
  if (!original || original.deliveryClass !== "ORIGINAL")
    throw new AssetError("NOT_FOUND");
  const manifest = getManifest(original.metadata);
  if (manifest.data.artifacts[0].id !== id) throw new AssetError("CONFLICT");
  await withTransaction((tx) =>
    authorizeTarget(
      context,
      manifest.data.target,
      original.kind === "IMAGE" ? "IMAGE" : "MODEL_3D",
      tx,
      original.state === "READY" ? id : undefined,
    ),
  );
  if (original.state === "READY") return result(manifest);
  if (original.state !== "PENDING") throw new AssetError("CONFLICT");
  for (const expected of manifest.data.artifacts) {
    signal.throwIfAborted();
    const asset = await findAsset(expected.id);
    if (
      !asset ||
      (asset.state !== "PENDING" && asset.state !== "READY") ||
      asset.scope !== original.scope ||
      asset.sizeBytes !== BigInt(expected.sizeBytes) ||
      asset.sha256 !== expected.sha256 ||
      asset.mimeType !== expected.mimeType
    )
      throw new AssetError("CONFLICT");
    const object = await storage.get(asset, { signal });
    const hash = createHash("sha256");
    let size = 0;
    try {
      if (
        object.contentType !== expected.mimeType ||
        object.sizeBytes !== expected.sizeBytes
      )
        throw new AssetError("CONFLICT");
      for await (const chunk of object.body) {
        size += chunk.length;
        if (size > expected.sizeBytes) throw new AssetError("CONFLICT");
        hash.update(chunk);
      }
      if (size !== expected.sizeBytes || hash.digest("hex") !== expected.sha256)
        throw new AssetError("CONFLICT");
    } finally {
      object.body.destroy();
    }
  }
  return withTransaction(async (tx) => {
    // Consistent root-before-asset order shared by collection mutations.
    if (manifest.data.target.kind === "collection")
      await lockCollectionItem(manifest.data.target.id, tx);
    if (
      manifest.data.target.kind === "packagingGeometry" ||
      (manifest.data.target.kind === "catalog" &&
        manifest.data.target.role === "SCREENSHOT" &&
        manifest.data.target.target === "gameRelease")
    )
      await lockCatalogWrites(tx);
    const actor = await authorizeTarget(
      context,
      manifest.data.target,
      original.kind === "IMAGE" ? "IMAGE" : "MODEL_3D",
      tx,
      id,
    );
    await lockAssets(
      manifest.data.artifacts.map((a) => a.id),
      tx,
    );
    const current = await findAsset(id, tx);
    if (current?.state === "READY") return result(manifest);
    if (
      current?.state !== "PENDING" ||
      JSON.stringify(current.metadata) !== JSON.stringify(original.metadata)
    )
      throw new AssetError("CONFLICT");
    for (const expected of manifest.data.artifacts)
      if ((await findAsset(expected.id, tx))?.state !== "PENDING")
        throw new AssetError("CONFLICT");
    await makeReady(manifest, tx);
    if (
      manifest.data.target.kind === "catalog" &&
      manifest.data.target.role === "SCREENSHOT" &&
      manifest.data.target.target === "gameRelease"
    )
      await recordScreenshotUpload(
        manifest.data.target.id,
        manifest.schemaVersion === 1 ? manifest.data.useId : "",
        actor.userId,
        tx,
      );
    if (manifest.data.target.kind === "collection") {
      const item = await findCollectionItem(manifest.data.target.id, tx);
      if (!item) throw new AssetError("NOT_FOUND");
      // New personal uses are private and do not change approved public output.
      const advanced = await advanceCollectionItem(
        item.id,
        item.revision,
        actor.userId,
        false,
        tx,
      );
      if (advanced.count !== 1) throw new AssetError("CONFLICT");
    }
    return result(manifest);
  }).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2002", "P2034"].includes(String(error.code))
    )
      throw new AssetError("CONFLICT");
    throw error;
  });
}

export async function privateAsset(context: PrivateAccessContext, id: string) {
  await requirePermission(context, "private.read");
  if (!z.uuid().safeParse(id).success) throw new AssetError("NOT_FOUND");
  const asset = await findAsset(id);
  if (!asset || asset.state !== "READY" || !asset.mimeType || !asset.sizeBytes)
    throw new AssetError("NOT_FOUND");
  return {
    locator: {
      storageNamespace: asset.storageNamespace,
      objectKey: asset.objectKey,
    },
    mimeType: asset.mimeType as StorageContentType,
    sizeBytes: Number(asset.sizeBytes),
    deliveryClass: asset.deliveryClass,
  };
}

// Explicit operator capability only: no scheduler or public deletion route.
// Abandoned PENDING reservations must age out before cleanup can claim them.
export async function deleteUnusedAsset(
  context: PrivateAccessContext,
  id: string,
  storage: ObjectStorage = getObjectStorage(),
) {
  if (!z.uuid().safeParse(id).success) throw new AssetError("NOT_FOUND");
  const asset = await withTransaction(async (tx) => {
    await requirePermission(context, "media.manage", tx);
    await lockAssets([id], tx);
    const current = await findAsset(id, tx);
    if (!current) return null;
    await requirePermission(
      context,
      current.scope === "CATALOG" ? "catalog.manage" : "media.manage",
      tx,
    );
    if (
      (await hasReferences(id, tx)) ||
      (await hasFamilyUses(id, tx)) ||
      (current.state === "PENDING" &&
        current.createdAt.getTime() > Date.now() - 86400000)
    )
      throw new AssetError("CONFLICT");
    return updateAsset(id, { state: "DELETING" }, tx);
  });
  if (!asset) return;
  await storage.remove(asset);
  await withTransaction(async (tx) => {
    await requirePermission(
      context,
      asset.scope === "CATALOG" ? "catalog.manage" : "media.manage",
      tx,
    );
    await lockAssets([id], tx);
    const current = await findAsset(id, tx);
    if (!current) return;
    if (current.state !== "DELETING" || (await hasReferences(id, tx)))
      throw new AssetError("CONFLICT");
    await removeAssetRecord(id, tx);
  });
}
