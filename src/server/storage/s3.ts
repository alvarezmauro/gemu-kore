import "server-only";

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageEnvironment } from "../config/storage-env";
import type {
  ObjectInfo,
  ObjectLocator,
  ObjectStorage,
  PutObjectInput,
  ReadOptions,
  StoredObject,
} from "./contracts";
import { normalizeStorageError, StorageError } from "./errors";
import {
  isStorageContentType,
  maximumObjectBytes,
  technicalObjectMetadata,
  validateObjectLocator,
} from "./objects";

function operation(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref();
  if (external?.aborted) cancel();
  else external?.addEventListener("abort", cancel, { once: true });
  return {
    signal: controller.signal,
    error: (error: unknown) =>
      timedOut
        ? new StorageError("UNAVAILABLE")
        : controller.signal.aborted
          ? new StorageError("ABORTED")
          : normalizeStorageError(error),
    release: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", cancel);
    },
  };
}

type Operation = ReturnType<typeof operation>;

async function retry<T>(scope: Operation, work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      scope.signal.throwIfAborted();
      return await work();
    } catch (error) {
      const normalized = scope.error(error);
      if (
        normalized.code !== "UNAVAILABLE" ||
        scope.signal.aborted ||
        attempt === 2
      )
        throw normalized;
      try {
        await delay(
          100 * 2 ** attempt + Math.floor(Math.random() * 100),
          undefined,
          { signal: scope.signal },
        );
      } catch (error) {
        throw scope.error(error);
      }
    }
  }
}

// Hold one chunk so invalid length/hash cannot finish an otherwise valid PUT.
async function* verifiedBytes(
  source: Readable,
  sizeBytes: number,
  scope: Operation,
  sha256?: string,
) {
  let received = 0;
  let previous: Buffer | undefined;
  const hash = sha256 ? createHash("sha256") : undefined;
  try {
    for await (const chunk of source) {
      scope.signal.throwIfAborted();
      if (!(chunk instanceof Uint8Array))
        throw new StorageError("INVALID_INPUT");
      const bytes = Buffer.from(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength,
      );
      received += bytes.length;
      if (received > sizeBytes) throw new StorageError("INVALID_INPUT");
      hash?.update(bytes);
      if (previous) yield previous;
      previous = bytes;
    }
    if (received !== sizeBytes || (hash && hash.digest("hex") !== sha256))
      throw new StorageError(sha256 ? "INVALID_INPUT" : "UNAVAILABLE");
    scope.signal.throwIfAborted();
    if (previous) yield previous;
  } catch (error) {
    throw scope.error(error);
  } finally {
    source.destroy();
  }
}

function objectInfo(
  size: number | undefined,
  contentType: string | undefined,
  etag: string | undefined,
): ObjectInfo {
  if (
    !Number.isSafeInteger(size) ||
    size! < 0 ||
    size! > maximumObjectBytes ||
    !isStorageContentType(contentType)
  )
    throw new StorageError("UNAVAILABLE");
  return { sizeBytes: size!, contentType, ...(etag ? { etag } : {}) };
}

export function createS3ObjectStorage(
  config: StorageEnvironment,
  options: { operationTimeoutMs?: number } = {},
): ObjectStorage & { close(): void } {
  const timeoutMs = options.operationTimeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new StorageError("INVALID_INPUT");
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Retry here so a consumed PUT body is never reused by SDK middleware.
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    followRegionRedirects: false,
  });
  const location = (locator: ObjectLocator) => {
    validateObjectLocator(locator);
    return { Bucket: config.bucket, Key: locator.objectKey };
  };

  return {
    async put(input: PutObjectInput) {
      const target = location(input.locator);
      const metadata = technicalObjectMetadata(
        input.locator,
        input.contentType,
        input.metadata,
      );
      if (
        !Number.isSafeInteger(input.sizeBytes) ||
        input.sizeBytes < 0 ||
        input.sizeBytes > maximumObjectBytes ||
        typeof input.openBody !== "function"
      )
        throw new StorageError("INVALID_INPUT");
      const scope = operation(input.signal, timeoutMs);
      try {
        const receipt = await retry(scope, async () => {
          const source = input.openBody();
          if (!(source instanceof Readable))
            throw new StorageError("INVALID_INPUT");
          const body = Readable.from(
            verifiedBytes(
              source,
              input.sizeBytes,
              scope,
              input.metadata.sha256,
            ),
            { objectMode: false },
          );
          const attempt = new AbortController();
          let streamError: unknown;
          body.on("error", (error) => {
            streamError = error;
          });
          source.on("error", () => {});
          const consumed = finished(body, { cleanup: true });
          void consumed.catch(() => {});
          const cancel = () => {
            const error = scope.error(undefined);
            source.destroy(error);
            body.destroy(error);
          };
          scope.signal.addEventListener("abort", cancel, { once: true });
          try {
            const [receipt] = await Promise.all([
              client.send(
                new PutObjectCommand({
                  ...target,
                  Body: body,
                  ContentLength: input.sizeBytes,
                  ContentType: input.contentType,
                  Metadata: metadata,
                }),
                {
                  abortSignal: AbortSignal.any([scope.signal, attempt.signal]),
                },
              ),
              consumed,
            ]);
            return receipt;
          } catch (error) {
            throw streamError ?? error;
          } finally {
            attempt.abort();
            scope.signal.removeEventListener("abort", cancel);
            body.destroy();
            source.destroy();
          }
        });
        return {
          sizeBytes: input.sizeBytes,
          ...(receipt.ETag ? { etag: receipt.ETag } : {}),
        };
      } finally {
        scope.release();
      }
    },
    async get(
      locator: ObjectLocator,
      options: ReadOptions = {},
    ): Promise<StoredObject> {
      const target = location(locator);
      const range = options.range;
      if (
        range &&
        (!Number.isSafeInteger(range.start) ||
          range.start < 0 ||
          (range.end !== undefined &&
            (!Number.isSafeInteger(range.end) || range.end < range.start)))
      )
        throw new StorageError("INVALID_RANGE");
      const scope = operation(options.signal, timeoutMs);
      let source: Readable | undefined;
      try {
        const result = await retry(scope, () =>
          client.send(
            new GetObjectCommand({
              ...target,
              ...(range
                ? { Range: `bytes=${range.start}-${range.end ?? ""}` }
                : {}),
            }),
            { abortSignal: scope.signal },
          ),
        );
        if (!(result.Body instanceof Readable))
          throw new StorageError("UNAVAILABLE");
        source = result.Body;
        source.on("error", () => {});
        const info = objectInfo(
          result.ContentLength,
          result.ContentType,
          result.ETag,
        );
        let returnedRange: StoredObject["range"];
        if (range) {
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
            result.ContentRange ?? "",
          );
          if (!match || result.$metadata.httpStatusCode !== 206)
            throw new StorageError("UNAVAILABLE");
          const [start, end, totalBytes] = match.slice(1).map(Number);
          if (
            ![start, end, totalBytes].every(Number.isSafeInteger) ||
            totalBytes > maximumObjectBytes ||
            start !== range.start ||
            end !== Math.min(range.end ?? totalBytes - 1, totalBytes - 1) ||
            end < start ||
            end - start + 1 !== info.sizeBytes
          )
            throw new StorageError("UNAVAILABLE");
          returnedRange = { start, end, totalBytes };
        } else if (
          result.ContentRange ||
          result.$metadata.httpStatusCode !== 200
        )
          throw new StorageError("UNAVAILABLE");
        const body = Readable.from(
          verifiedBytes(source, info.sizeBytes, scope),
          { objectMode: false },
        );
        const upstream = source;
        const cancel = () => {
          const error = scope.error(undefined);
          upstream.destroy(error);
          body.destroy(error);
        };
        body.on("error", () => {});
        upstream.on("error", () => {});
        scope.signal.addEventListener("abort", cancel, { once: true });
        body.once("close", () => {
          scope.signal.removeEventListener("abort", cancel);
          upstream.destroy();
          scope.release();
        });
        if (scope.signal.aborted) cancel();
        return {
          ...info,
          body,
          ...(returnedRange ? { range: returnedRange } : {}),
        };
      } catch (error) {
        source?.destroy();
        scope.release();
        throw scope.error(error);
      }
    },
    async stat(locator: ObjectLocator, options = {}) {
      const target = location(locator);
      const scope = operation(options.signal, timeoutMs);
      try {
        const result = await retry(scope, () =>
          client.send(new HeadObjectCommand(target), {
            abortSignal: scope.signal,
          }),
        );
        return objectInfo(
          result.ContentLength,
          result.ContentType,
          result.ETag,
        );
      } catch (error) {
        const normalized = scope.error(error);
        if (normalized.code === "NOT_FOUND") {
          // HEAD has no error body: missing buckets and keys both become 404.
          // A bounded GET returns the structured error needed to distinguish them.
          try {
            const probe = await retry(scope, async () => {
              try {
                return await client.send(
                  new GetObjectCommand({ ...target, Range: "bytes=0-0" }),
                  { abortSignal: scope.signal },
                );
              } catch (error) {
                // Inspect only this error code before the retry boundary redacts it.
                if (
                  error !== null &&
                  typeof error === "object" &&
                  "name" in error &&
                  error.name === "NoSuchKey"
                )
                  return null;
                throw error;
              }
            });
            if (probe === null) return null;
            if (probe.Body instanceof Readable) {
              probe.Body.on("error", () => {});
              probe.Body.destroy();
            }
          } catch (probeError) {
            const confirmed = scope.error(probeError);
            throw confirmed.code === "NOT_FOUND" ||
              confirmed.code === "INVALID_RANGE"
              ? new StorageError("UNAVAILABLE")
              : confirmed;
          }
          // The object appeared between requests; ask the caller to retry HEAD.
          throw new StorageError("UNAVAILABLE");
        }
        throw normalized;
      } finally {
        scope.release();
      }
    },
    async remove(locator: ObjectLocator, options = {}) {
      const target = location(locator);
      const scope = operation(options.signal, timeoutMs);
      try {
        await retry(scope, () =>
          client.send(new DeleteObjectCommand(target), {
            abortSignal: scope.signal,
          }),
        );
      } catch (error) {
        const normalized = scope.error(error);
        if (normalized.code !== "NOT_FOUND") throw normalized;
      } finally {
        scope.release();
      }
    },
    close() {
      client.destroy();
    },
  };
}
