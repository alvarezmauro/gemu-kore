import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  describeMetadataSource,
  safeSourceLink,
  assetAttribution,
} from "./provenance";
const sourceSnapshot = {
  schemaVersion: 1,
  data: {
    provider: "IGDB",
    mappingVersion: "igdb-v1",
    scope: "GAME",
    retrievedAt: "2026-10-19T12:00:00.000Z",
    transformation: "APPEND_PRESERVING_EXISTING",
    query: "private query marker",
    evidence: [
      {
        sourceUrl: "https://www.igdb.com/games/orbit-quest",
        sourceUpdatedAt: "2026-10-18T12:00:00.000Z",
        normalization: "SECONDS_TO_MINUTES",
        originalValue: 1800,
      },
    ],
  },
};
const row = {
  origin: "PROVIDER",
  snapshotSchemaVersion: 1,
  createdAt: new Date("2026-10-19T12:01:00.000Z"),
  sourceSnapshot,
};
it("projects retained source links, scope and transformations without raw snapshots or invented confidence", () => {
  const source = describeMetadataSource(row);
  expect(source).toMatchObject({
    origin: "PROVIDER",
    source: {
      name: "IGDB",
      confidence: null,
      urls: ["https://www.igdb.com/games/orbit-quest"],
      transformations: [
        "Sourced entries added while retaining existing values.",
        "Durations converted from seconds to minutes.",
      ],
    },
  });
  expect(JSON.stringify(source)).not.toContain("private query marker");
  expect(JSON.stringify(source)).not.toContain("originalValue");
  expect(sourceSnapshot.data.evidence[0].originalValue).toBe(1800);
});
it("distinguishes manual, seeded, missing, unknown and unsupported source records", () => {
  expect(describeMetadataSource({ ...row, origin: "MANUAL" })).toMatchObject({
    origin: "MANUAL",
    source: null,
  });
  expect(
    describeMetadataSource({ ...row, origin: "SEED", sourceSnapshot: null }),
  ).toMatchObject({ origin: "SEED", source: null });
  expect(describeMetadataSource(undefined)).toMatchObject({
    origin: "UNKNOWN",
    source: null,
  });
  expect(
    describeMetadataSource({ ...row, snapshotSchemaVersion: 2 }),
  ).toMatchObject({ origin: "UNKNOWN", source: null });
  expect(
    describeMetadataSource({
      ...row,
      sourceSnapshot: { schemaVersion: 2, data: sourceSnapshot.data },
    }),
  ).toMatchObject({ origin: "PROVIDER", source: null });
  expect(
    describeMetadataSource({
      ...row,
      origin: "AI_ASSISTED",
      sourceSnapshot: {},
    }),
  ).toMatchObject({ origin: "AI_ASSISTED", source: null });
});
it.each([
  "javascript:alert(1)",
  "data:text/html,test",
  "//example.com/path",
  "https://user:password@example.com/secret",
  "file:///tmp/private",
  "https://example.com/" + "x".repeat(2050),
])("omits unsafe source links %s", (url) => {
  expect(safeSourceLink(url)).toBeNull();
});
it("keeps permitted source/rights text separate from private storage and actor data", () => {
  const result = assetAttribution({
    sourceType: "CURATED",
    provider: "Archive",
    sourceUrl: "javascript:alert(1)",
    author: "Artist",
    licenseName: "Not specified",
    licenseUrl: "https://example.com/license",
    attribution: "Credit me",
    usageRestrictions: "Private reference only",
    retrievedAt: new Date("2026-10-19T12:00:00.000Z"),
    objectKey: "secret-object",
    uploadedById: "private-actor",
  } as Parameters<typeof assetAttribution>[0]);
  expect(result).toMatchObject({
    author: "Artist",
    attribution: "Credit me",
    restrictions: "Private reference only",
    url: null,
    licenseUrl: "https://example.com/license",
  });
  expect(JSON.stringify(result)).not.toMatch(/secret-object|private-actor/);
});
