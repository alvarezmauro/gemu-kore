import "server-only";

export type StorageErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_RANGE"
  | "ACCESS_DENIED"
  | "UNAVAILABLE"
  | "ABORTED";

const messages: Record<StorageErrorCode, string> = {
  NOT_FOUND: "Stored object was not found.",
  INVALID_INPUT: "Invalid storage input.",
  INVALID_RANGE: "Invalid object byte range.",
  ACCESS_DENIED: "Storage access or configuration failed.",
  UNAVAILABLE: "Storage operation is unavailable.",
  ABORTED: "Storage operation was cancelled.",
};

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(messages[code]);
    this.name = "StorageError";
  }
}

export function normalizeStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const details =
    error && typeof error === "object"
      ? (error as { name?: string; $metadata?: { httpStatusCode?: number } })
      : {};
  const status = details.$metadata?.httpStatusCode;
  if (
    [
      "NoSuchBucket",
      "InvalidAccessKeyId",
      "SignatureDoesNotMatch",
      "AccessDenied",
    ].includes(details.name ?? "") ||
    status === 401 ||
    status === 403
  )
    return new StorageError("ACCESS_DENIED");
  if (["NoSuchKey", "NotFound"].includes(details.name ?? "") || status === 404)
    return new StorageError("NOT_FOUND");
  if (details.name === "InvalidRange" || status === 416)
    return new StorageError("INVALID_RANGE");
  if (status === 400 || details.name === "InvalidArgument")
    return new StorageError("INVALID_INPUT");
  if (details.name === "AbortError") return new StorageError("ABORTED");
  return new StorageError("UNAVAILABLE");
}
