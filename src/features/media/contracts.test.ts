import { expect, it } from "vitest";
import { movePhoto, photoTypes } from "./contracts";
import { mediaMutation } from "./validation";
import { validatePhoto } from "./upload";
const id = "b41b30e9-0562-4896-9740-f9b742c102eb";
const other = "150fd38d-da64-46e6-9a7a-1d04ae980204";
const valid = {
  operation: "update",
  collectionItemId: id,
  expectedRevision: 3,
  id: other,
  type: "FRONT",
  caption: " Box front ",
  altText: " Red cover ",
};
it("normalizes optional copy-specific photo descriptions", () => {
  expect(mediaMutation.parse(valid)).toMatchObject({
    caption: "Box front",
    altText: "Red cover",
  });
  expect(
    mediaMutation.parse({ ...valid, caption: " ", altText: "" }),
  ).toMatchObject({ caption: null, altText: null });
});
it.each(photoTypes)("accepts the %s photo classification", (type) => {
  expect(mediaMutation.safeParse({ ...valid, type }).success).toBe(true);
});
it.each([
  { type: "CUSTOM_MODEL" },
  { type: "CUSTOM_LOGO" },
  { expectedRevision: 0 },
  { collectionItemId: "bad" },
  { caption: "a".repeat(2001) },
  { altText: "a".repeat(1001) },
  { publicApproved: true },
  { assetId: id },
])("rejects invalid or privileged input %j", (fields) => {
  expect(mediaMutation.safeParse({ ...valid, ...fields }).success).toBe(false);
});
it("rejects duplicate order IDs", () => {
  expect(
    mediaMutation.safeParse({
      operation: "reorder",
      collectionItemId: id,
      expectedRevision: 1,
      ids: [other, other],
    }).success,
  ).toBe(false);
});
it("moves a photo without mutating or losing the other IDs", () => {
  const ids = ["a", "b", "c"];
  expect(movePhoto(ids, "a", 2)).toEqual(["b", "c", "a"]);
  expect(ids).toEqual(["a", "b", "c"]);
  expect(movePhoto(ids, "c", 0)).toEqual(["c", "a", "b"]);
  expect(movePhoto(ids, "missing", 0)).toEqual(ids);
});
it.each(["image/jpeg", "image/png", "image/webp", "image/avif"])(
  "permits bounded %s picker files",
  (type) => {
    expect(validatePhoto({ type, size: 25 * 1024 * 1024 })).toBeNull();
  },
);
it.each([
  { type: "image/heic", size: 10 },
  { type: "image/svg+xml", size: 10 },
  { type: "image/gif", size: 10 },
  { type: "image/jpeg", size: 0 },
  { type: "image/jpeg", size: 25 * 1024 * 1024 + 1 },
])("rejects unsupported picker file %j", (file) => {
  expect(validatePhoto(file)).toBeTypeOf("string");
});
