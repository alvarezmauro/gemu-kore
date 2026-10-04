import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { artifactSchema, manifestSchema, targetSchema } from "./contracts";
const artifact = () => ({
  id: randomUUID(),
  mimeType: "image/png",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  width: 80,
  height: 40,
  variant: "original",
});
const manifest = () => ({
  schemaVersion: 1,
  data: {
    target: { kind: "collection", id: randomUUID() },
    useId: randomUUID(),
    artifacts: [artifact()],
  },
});
describe("normalized asset metadata", () => {
  it("defaults photo classification in a fresh result without mutating the supplied manifest", () => {
    const input = manifest();
    const before = JSON.stringify(input);
    const parsed = manifestSchema.parse(input);
    expect(parsed.data.target).toMatchObject({
      kind: "collection",
      type: "PHOTO",
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(manifestSchema.parse(parsed)).toEqual(parsed);
    expect(parsed).not.toBe(input);
  });
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    50 * 1024 * 1024 + 1,
  ])("rejects invalid byte size %s", (sizeBytes) => {
    expect(artifactSchema.safeParse({ ...artifact(), sizeBytes }).success).toBe(
      false,
    );
  });
  it.each([1, 50 * 1024 * 1024])(
    "accepts bounded byte size %s without numeric coercion",
    (sizeBytes) => {
      expect(artifactSchema.parse({ ...artifact(), sizeBytes }).sizeBytes).toBe(
        sizeBytes,
      );
    },
  );
  it("refuses numeric strings and JSON null rather than guessing dimensions or sizes", () => {
    for (const field of ["width", "height", "sizeBytes"])
      for (const value of ["80", null])
        expect(
          artifactSchema.safeParse({ ...artifact(), [field]: value }).success,
        ).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid image dimensions %s",
    (value) => {
      for (const field of ["width", "height"])
        expect(
          artifactSchema.safeParse({ ...artifact(), [field]: value }).success,
        ).toBe(false);
    },
  );
  it.each([
    "",
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    "a".repeat(64) + "\n",
    "a".repeat(64) + "\r\n",
    null,
  ])("rejects a noncanonical SHA-256 %j", (sha256) => {
    expect(artifactSchema.safeParse({ ...artifact(), sha256 }).success).toBe(
      false,
    );
  });
  it("retains absent dimensions for GLB without manufacturing image metadata", () => {
    const input = {
      id: randomUUID(),
      mimeType: "model/gltf-binary",
      sizeBytes: 32,
      sha256: "f".repeat(64),
      variant: "original",
    };
    expect(artifactSchema.parse(input)).toEqual(input);
  });
  it.each([
    "objectKey",
    "storageNamespace",
    "filename",
    "exif",
    "publicSafe",
    "rightsStatus",
    "uploadedById",
  ])("refuses unexpected artifact metadata field %s", (field) => {
    expect(
      artifactSchema.safeParse({ ...artifact(), [field]: "private-value" })
        .success,
    ).toBe(false);
  });
  it.each([
    "image/svg+xml",
    "text/html",
    "image/gif",
    "image/heic",
    "model/gltf+json",
  ])("rejects unsupported normalized artifact MIME %s", (mimeType) => {
    expect(artifactSchema.safeParse({ ...artifact(), mimeType }).success).toBe(
      false,
    );
  });
  it.each([0, 2, "1", null])(
    "rejects unsupported manifest version %j",
    (schemaVersion) => {
      expect(
        manifestSchema.safeParse({ ...manifest(), schemaVersion }).success,
      ).toBe(false);
    },
  );
  it("bounds artifact arrays and rejects fields at every envelope level", () => {
    for (const count of [0, 4]) {
      const input = manifest();
      input.data.artifacts = Array.from({ length: count }, artifact);
      expect(manifestSchema.safeParse(input).success).toBe(false);
    }
    const input = manifest();
    expect(
      manifestSchema.safeParse({ ...input, publicSafe: true }).success,
    ).toBe(false);
    expect(
      manifestSchema.safeParse({
        ...input,
        data: { ...input.data, objectKey: "secret" },
      }).success,
    ).toBe(false);
  });
  it.each([
    "company",
    "consolePlatform",
    "consoleModel",
    "game",
    "gameRelease",
    "accessory",
    "accessoryVariant",
  ])("retains the explicit canonical %s target", (target) => {
    const input = { kind: "catalog", id: randomUUID(), target, role: "LOGO" };
    expect(targetSchema.parse(input)).toEqual(input);
  });
  it.each([
    "publicApproved",
    "publicDisplayAssetId",
    "rightsStatus",
    "scope",
    "role",
    "objectKey",
  ])("rejects supplied collection privilege/storage field %s", (field) => {
    expect(
      targetSchema.safeParse({
        kind: "collection",
        id: randomUUID(),
        [field]: "forged",
      }).success,
    ).toBe(false);
  });
  it("rejects missing, cross-domain and obsolete target identifiers", () => {
    for (const input of [
      { kind: "catalog", target: "game", role: "LOGO" },
      {
        kind: "catalog",
        id: randomUUID(),
        target: "collectionItem",
        role: "LOGO",
      },
      { kind: "collection", id: randomUUID(), type: "MODEL_3D" },
      { kind: "application", role: "COLLECTION_LOGO", id: randomUUID() },
      { kind: "collection", id: "../../private" },
    ])
      expect(targetSchema.safeParse(input).success).toBe(false);
  });
});
