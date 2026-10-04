import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createObjectLocator,
  isStorageContentType,
  technicalObjectMetadata,
  validateObjectLocator,
} from "./objects";
import type { ObjectMetadata, StorageContentType } from "./contracts";
const id = "12345678-1234-4234-8234-123456789abc";
const object = "abcdefab-cdef-4abc-9def-abcdefabcdef";
const key = `assets/${id}/${object}.jpg`;
const locator = { storageNamespace: "primary", objectKey: key };
const metadata = { assetId: id, sha256: "a".repeat(64) };
const formats: [StorageContentType, string][] = [
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["model/gltf-binary", "glb"],
];
describe("opaque asset object locators", () => {
  it.each(formats)(
    "allocates a canonical %s key and technical metadata",
    (mime, extension) => {
      const assetId = randomUUID();
      const result = createObjectLocator(assetId, mime);
      expect(result.storageNamespace).toBe("primary");
      expect(validateObjectLocator(result)).toEqual({ assetId, extension });
      expect(result.objectKey.split("/")).toHaveLength(3);
      expect(result.objectKey.endsWith(`.${extension}`)).toBe(true);
      expect(
        technicalObjectMetadata(result, mime, {
          assetId,
          sha256: metadata.sha256,
        }),
      ).toEqual({ "asset-id": assetId, sha256: metadata.sha256 });
    },
  );
  it("keeps each allocation distinct even for repeated content and the same asset", () => {
    const keys = new Set(
      Array.from(
        { length: 128 },
        () => createObjectLocator(id, "image/jpeg").objectKey,
      ),
    );
    expect(keys.size).toBe(128);
    for (const objectKey of keys) {
      expect(validateObjectLocator({ ...locator, objectKey })).toEqual({
        assetId: id,
        extension: "jpg",
      });
      expect(objectKey).not.toContain(metadata.sha256);
    }
  });
  it.each([
    "",
    "not-a-uuid",
    id.toUpperCase(),
    "00000000-0000-0000-0000-000000000000",
    id.replace("-4234-", "-0234-"),
    id.replace("-8234-", "-1234-"),
    id + "\n",
    "../" + id,
  ])("rejects noncanonical asset ID %j", (assetId) => {
    expect(() => createObjectLocator(assetId, "image/jpeg")).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
  it.each([
    key + "\n",
    key + "\r\n",
    key + "?token=secret",
    key + "#private",
    key + "/extra",
    key.replace("assets/", "/assets/"),
    key.replace("assets/", "Assets/"),
    key.replace("assets/", "assets//"),
    key.replace(".jpg", ".JPG"),
    key.replace(".jpg", ".jpeg"),
    key.replace(".jpg", ".html"),
    key.replace(".jpg", ".svg"),
    key.replace(object, "original"),
    key.replace(object, object.toUpperCase()),
    key.replace(object, object.replace("-4abc-", "-0abc-")),
    key.replace(object, object.replace("-9def-", "-1def-")),
    key.replace("/", "\\"),
    `assets/${id}/../${object}.jpg`,
    `assets/${id}/%2e%2e/${object}.jpg`,
    `https://example.com/${key}`,
    `s3://bucket/${key}`,
  ])("rejects malformed, encoded or URL-shaped key %j", (objectKey) => {
    expect(() => validateObjectLocator({ ...locator, objectKey })).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
  it.each(["", "PRIMARY", "other", "primary/../private", "primary\n"])(
    "refuses namespace substitution %j",
    (storageNamespace) => {
      expect(() =>
        validateObjectLocator({ ...locator, storageNamespace }),
      ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    },
  );
});
describe("safe MIME and object metadata", () => {
  it.each(formats)("recognizes supported MIME %s", (mime) =>
    expect(isStorageContentType(mime)).toBe(true),
  );
  it.each([
    null,
    undefined,
    0,
    true,
    {},
    ["image/png"],
    "image/svg+xml",
    "application/octet-stream",
    "image/heic",
    "image/png; charset=utf-8",
    "image/png\n",
    "constructor",
    "toString",
    "__proto__",
  ])("refuses unsupported runtime MIME %j", (mime) => {
    expect(isStorageContentType(mime)).toBe(false);
    if (typeof mime === "string")
      expect(() => createObjectLocator(id, mime as StorageContentType)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
  });
  it.each([
    "",
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    "a".repeat(64) + "\n",
    "a".repeat(64) + "\r\n",
  ])("rejects noncanonical technical SHA-256 %j", (sha256) => {
    expect(() =>
      technicalObjectMetadata(locator, "image/jpeg", { ...metadata, sha256 }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
  it.each([
    "originalFilename",
    "sourceUrl",
    "licenseName",
    "attribution",
    "email",
    "exif",
    "rightsStatus",
    "publicSafe",
    "objectKey",
  ])("rejects private/provenance object metadata field %s", (field) => {
    expect(() =>
      technicalObjectMetadata(locator, "image/jpeg", {
        ...metadata,
        [field]: "private-collector-secret",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
  it("returns independent technical fields without mutating frozen inputs", () => {
    const frozenLocator = Object.freeze({ ...locator });
    const frozen = Object.freeze({ ...metadata });
    const result = technicalObjectMetadata(frozenLocator, "image/jpeg", frozen);
    expect(result).toEqual({ "asset-id": id, sha256: metadata.sha256 });
    result.sha256 = "changed";
    expect(frozen.sha256).toBe(metadata.sha256);
    expect(
      technicalObjectMetadata(frozenLocator, "image/jpeg", frozen),
    ).toEqual({ "asset-id": id, sha256: metadata.sha256 });
  });
  it("never copies inherited private metadata into storage headers", () => {
    const inherited = Object.assign(
      Object.create({ filename: "private.jpg", email: "private@example.com" }),
      metadata,
    ) as ObjectMetadata;
    expect(technicalObjectMetadata(locator, "image/jpeg", inherited)).toEqual({
      "asset-id": id,
      sha256: metadata.sha256,
    });
  });
  it("binds MIME and metadata to the reserved asset, never another allocation", () => {
    for (const mime of [
      "image/png",
      "image/webp",
      "image/avif",
      "model/gltf-binary",
    ] as const)
      expect(() => technicalObjectMetadata(locator, mime, metadata)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    expect(() =>
      technicalObjectMetadata(locator, "image/jpeg", {
        ...metadata,
        assetId: randomUUID(),
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
});
