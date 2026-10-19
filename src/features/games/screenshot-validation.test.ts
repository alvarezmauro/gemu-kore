import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  screenshotUpload,
  emptyScreenshotUpload,
  screenshotMutation,
  safeScreenshotUrl,
} from "./screenshot-validation";
import { targetSchema, manifestSchema } from "@/server/assets/contracts";
const id = "11111111-1111-4111-8111-111111111111";
it("records bounded UTF-8 provenance without granting rights and round-trips upload manifests", () => {
  const screenshot = screenshotUpload.parse({
    ...emptyScreenshotUpload,
    author: "山田",
    retrievedAt: "2024-02-29",
  });
  const target = {
    kind: "catalog",
    id,
    target: "gameRelease",
    role: "SCREENSHOT",
    screenshot,
  };
  expect(targetSchema.parse(target)).toEqual(target);
  expect(targetSchema.safeParse({ ...target, target: "company" }).success).toBe(
    false,
  );
  expect(targetSchema.safeParse({ ...target, role: "COVER" }).success).toBe(
    false,
  );
  const manifest = {
    schemaVersion: 1,
    data: {
      target,
      useId: id,
      artifacts: [
        {
          id,
          mimeType: "image/png",
          sizeBytes: 1,
          sha256: "a".repeat(64),
          variant: "original",
        },
      ],
    },
  };
  expect(manifestSchema.parse(manifest).data.target).toEqual(target);
  expect(
    screenshotUpload.safeParse({ ...emptyScreenshotUpload, publicSafe: true })
      .success,
  ).toBe(false);
  expect(
    screenshotUpload.safeParse({
      ...emptyScreenshotUpload,
      attribution: "山".repeat(500),
      caption: "x".repeat(800),
    }).success,
  ).toBe(false);
});
it.each([
  "javascript:alert(1)",
  "data:text/html,hello",
  "https://name:password@example.com",
])("rejects unsafe source URL %s", (sourceUrl) => {
  expect(
    screenshotUpload.safeParse({ ...emptyScreenshotUpload, sourceUrl }).success,
  ).toBe(false);
  expect(safeScreenshotUrl(sourceUrl)).toBeNull();
});
it.each(["2023-02-29", "2024-02-30", "0000-01-01", "bad", "9999-99-99"])(
  "rejects invalid source date %s without throwing",
  (retrievedAt) => {
    expect(
      screenshotUpload.safeParse({ ...emptyScreenshotUpload, retrievedAt })
        .success,
    ).toBe(false);
  },
);
it("requires release revisions and rejects source/asset substitution during caption edits", () => {
  const input = {
    operation: "update",
    releaseId: id,
    id,
    expectedRevision: 1,
    caption: "Scene",
    altText: "Forest",
  };
  expect(screenshotMutation.parse(input)).toEqual(input);
  for (const key of ["sourceUrl", "assetId", "publicApproved", "role"])
    expect(
      screenshotMutation.safeParse({ ...input, [key]: "forged" }).success,
    ).toBe(false);
  expect(
    screenshotMutation.safeParse({ ...input, expectedRevision: 0 }).success,
  ).toBe(false);
});
