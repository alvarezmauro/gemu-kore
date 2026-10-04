import "server-only";

import { getStorageEnv } from "../config/env";
import type { ObjectStorage } from "./contracts";
import { StorageError } from "./errors";
import { createS3ObjectStorage } from "./s3";

let storage: ObjectStorage | undefined;

export function getObjectStorage(): ObjectStorage {
  if (storage) return storage;
  const config = getStorageEnv();
  if (!config) throw new StorageError("ACCESS_DENIED");
  storage = createS3ObjectStorage(config);
  return storage;
}
