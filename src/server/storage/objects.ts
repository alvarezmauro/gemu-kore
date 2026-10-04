import "server-only";

import { randomUUID } from "node:crypto";
import type {
  ObjectLocator,
  ObjectMetadata,
  StorageContentType,
} from "./contracts";
import { StorageError } from "./errors";

export const storageNamespace = "primary";
export const maximumObjectBytes = 50 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const key =
  /^assets\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp|avif|glb)$/;
const extensions: Record<StorageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "model/gltf-binary": "glb",
};

export function isStorageContentType(
  value: unknown,
): value is StorageContentType {
  return typeof value === "string" && Object.hasOwn(extensions, value);
}

export function createObjectLocator(
  assetId: string,
  contentType: StorageContentType,
): ObjectLocator {
  if (
    assetId.length !== 36 ||
    !uuid.test(assetId) ||
    !isStorageContentType(contentType)
  )
    throw new StorageError("INVALID_INPUT");
  return {
    storageNamespace,
    objectKey: `assets/${assetId}/${randomUUID()}.${extensions[contentType]}`,
  };
}

export function validateObjectLocator(locator: ObjectLocator): {
  assetId: string;
  extension: string;
} {
  const match =
    typeof locator?.objectKey === "string" ? key.exec(locator.objectKey) : null;
  if (
    locator?.storageNamespace !== storageNamespace ||
    !match ||
    match[0] !== locator.objectKey ||
    !uuid.test(match[1]) ||
    !uuid.test(match[2])
  )
    throw new StorageError("INVALID_INPUT");
  return { assetId: match[1], extension: match[3] };
}

export function technicalObjectMetadata(
  locator: ObjectLocator,
  contentType: StorageContentType,
  metadata: ObjectMetadata,
): Record<string, string> {
  const { assetId, extension } = validateObjectLocator(locator);
  if (
    !isStorageContentType(contentType) ||
    extensions[contentType] !== extension ||
    metadata?.assetId !== assetId ||
    typeof metadata.sha256 !== "string" ||
    metadata.sha256.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
    Object.keys(metadata).some(
      (field) => !["assetId", "sha256"].includes(field),
    )
  )
    throw new StorageError("INVALID_INPUT");
  return { "asset-id": assetId, sha256: metadata.sha256 };
}
