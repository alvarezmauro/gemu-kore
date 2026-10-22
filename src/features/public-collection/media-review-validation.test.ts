import { expect, it } from "vitest";
import {
  mediaReviewInput,
  mediaReviewSave,
  componentReviewInput,
  componentReviewSave,
} from "./media-review-validation";
const useId = "11111111-1111-4111-8111-111111111111";
const displayAssetId = "22222222-2222-4222-8222-222222222222";
const media = { kind: "catalog", useId, displayAssetId, approved: true };
const component = { componentId: useId, approved: true };
// Tokens are opaque freshness evidence here; services verify their contents
// and current administrator authority separately.
const evidence = { reviewToken: "t".repeat(64), reviewed: true };
it.each(["personal", "catalog", "site"])(
  "accepts explicit approval and withdrawal intent for %s",
  (kind) => {
    for (const approved of [true, false]) {
      const input = { ...media, kind, approved };
      expect(mediaReviewInput.parse(input)).toEqual(input);
      expect(mediaReviewSave.parse({ ...input, ...evidence })).toEqual({
        ...input,
        ...evidence,
      });
    }
  },
);
it.each([true, false])(
  "requires review evidence for component intent %s",
  (approved) => {
    expect(componentReviewInput.parse({ ...component, approved })).toEqual({
      ...component,
      approved,
    });
    expect(
      componentReviewSave.parse({ ...component, approved, ...evidence }),
    ).toMatchObject({ approved, ...evidence });
  },
);
it.each([
  {},
  { reviewed: false, reviewToken: "t".repeat(64) },
  { reviewed: "true", reviewToken: "t".repeat(64) },
  { reviewed: true, reviewToken: "t".repeat(63) },
  { reviewed: true, reviewToken: "t".repeat(65) },
  { reviewed: true, reviewToken: null },
])("rejects missing or malformed save evidence %j", (proof) => {
  expect(mediaReviewSave.safeParse({ ...media, ...proof }).success).toBe(false);
  expect(
    componentReviewSave.safeParse({ ...component, ...proof }).success,
  ).toBe(false);
});
it.each([
  "role",
  "approvedById",
  "reviewedById",
  "publicSafe",
  "rightsStatus",
  "publicCollectionEnabled",
])("rejects injected %s in previews and writes", (key) => {
  for (const [schema, input] of [
    [mediaReviewInput, media],
    [mediaReviewSave, { ...media, ...evidence }],
    [componentReviewInput, component],
    [componentReviewSave, { ...component, ...evidence }],
  ] as const)
    expect(schema.safeParse({ ...input, [key]: useId }).success).toBe(false);
});
it.each([
  { kind: "asset" },
  { kind: "component" },
  { useId: "not-a-uuid" },
  { displayAssetId: "" },
  { approved: "true" },
  { assetId: displayAssetId },
])("rejects ambiguous media identity or intent %j", (patch) => {
  expect(mediaReviewInput.safeParse({ ...media, ...patch }).success).toBe(
    false,
  );
});
it("does not interchange component and media-use identities", () => {
  expect(componentReviewInput.safeParse(media).success).toBe(false);
  expect(mediaReviewInput.safeParse(component).success).toBe(false);
  expect(
    componentReviewInput.safeParse({ ...component, componentId: "not-a-uuid" })
      .success,
  ).toBe(false);
});
