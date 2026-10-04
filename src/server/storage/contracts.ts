import "server-only";

import type { Readable } from "node:stream";

export type StorageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"
  | "model/gltf-binary";
export type ObjectLocator = Readonly<{
  storageNamespace: string;
  objectKey: string;
}>;
export type ObjectMetadata = Readonly<{ assetId: string; sha256: string }>;
export type ByteRange = Readonly<{ start: number; end?: number }>;
export type ReadOptions = { signal?: AbortSignal; range?: ByteRange };
export type ObjectInfo = {
  sizeBytes: number;
  contentType: StorageContentType;
  etag?: string;
};
export type StoredObject = ObjectInfo & {
  body: Readable;
  range?: { start: number; end: number; totalBytes: number };
};
export type PutObjectInput = {
  locator: ObjectLocator;
  // Every invocation opens the same validated bytes from the beginning.
  openBody: () => Readable;
  sizeBytes: number;
  contentType: StorageContentType;
  metadata: ObjectMetadata;
  signal?: AbortSignal;
};

// Trusted server capability, not a session/permission boundary. Services must
// authorize and reserve immutable keys before invoking it; no route exists yet.
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<{ sizeBytes: number; etag?: string }>;
  get(locator: ObjectLocator, options?: ReadOptions): Promise<StoredObject>;
  stat(
    locator: ObjectLocator,
    options?: { signal?: AbortSignal },
  ): Promise<ObjectInfo | null>;
  remove(
    locator: ObjectLocator,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}
