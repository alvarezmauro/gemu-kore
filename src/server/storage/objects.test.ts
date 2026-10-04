import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createObjectLocator,
  technicalObjectMetadata,
  validateObjectLocator,
} from "./objects";
import { normalizeStorageError } from "./errors";

it("generates different opaque keys with canonical extensions and no filenames", () => {
  const assetId = randomUUID();
  const first = createObjectLocator(assetId, "image/jpeg");
  const second = createObjectLocator(assetId, "image/jpeg");
  expect(first).not.toEqual(second);
  expect(first.objectKey).toMatch(
    /^assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/,
  );
  expect(validateObjectLocator(first)).toEqual({ assetId, extension: "jpg" });
});

it.each([
  "../private.jpg",
  "https://example.com/image.png",
  "assets/name/original.jpg",
  "assets/../secret",
  "\r\nprivate",
])("rejects unallocated keys: %s", (objectKey) => {
  expect(() =>
    validateObjectLocator({ storageNamespace: "primary", objectKey }),
  ).toThrow();
});
it("fails closed on unknown namespaces and nontechnical metadata", () => {
  const locator = createObjectLocator(randomUUID(), "image/png");
  const metadata = {
    assetId: locator.objectKey.split("/")[1],
    sha256: "a".repeat(64),
  };
  expect(() =>
    validateObjectLocator({ ...locator, storageNamespace: "other" }),
  ).toThrow();
  expect(technicalObjectMetadata(locator, "image/png", metadata)).toEqual({
    "asset-id": metadata.assetId,
    sha256: metadata.sha256,
  });
  expect(() =>
    technicalObjectMetadata(locator, "image/jpeg", metadata),
  ).toThrow();
  expect(() =>
    technicalObjectMetadata(locator, "image/png", {
      ...metadata,
      sha256: "bad",
    }),
  ).toThrow();
  expect(() =>
    technicalObjectMetadata(locator, "image/png", {
      ...metadata,
      assetId: randomUUID(),
    }),
  ).toThrow();
  const privateMetadata = { ...metadata, filename: "private-name.png" };
  expect(() =>
    technicalObjectMetadata(locator, "image/png", privateMetadata),
  ).toThrow();
});

it.each([
  ["NoSuchKey", 404, "NOT_FOUND"],
  ["NoSuchBucket", 404, "ACCESS_DENIED"],
  ["AccessDenied", 403, "ACCESS_DENIED"],
  ["InvalidRange", 416, "INVALID_RANGE"],
  ["SlowDown", 503, "UNAVAILABLE"],
  ["InvalidArgument", 400, "INVALID_INPUT"],
])("normalizes %s without exposing upstream details", (name, status, code) => {
  const error = normalizeStorageError({
    name,
    message: "credential-secret",
    $metadata: { httpStatusCode: status },
  });
  expect(error.code).toBe(code);
  expect(error.message).not.toContain("credential-secret");
  expect(error.cause).toBeUndefined();
});
