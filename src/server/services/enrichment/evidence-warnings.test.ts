import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type {
  GameMetadataResult,
  GameSearchPage,
} from "@/server/providers/game-metadata/contracts";
import { evidenceWarnings } from "./evidence-warnings";

const envelope = {
  schemaVersion: 1 as const,
  provider: "IGDB" as const,
  mappingVersion: "fixture-v1",
  retrievedAt: "2026-10-19T12:00:00.000Z",
  evidence: [
    {
      id: "identity",
      ref: {
        provider: "IGDB" as const,
        objectType: "GAME" as const,
        externalId: "42",
      },
      sourceUrl: null,
      fieldPath: "name",
      retrievedAt: "2026-10-19T12:00:00.000Z",
      sourceUpdatedAt: null,
      normalization: "NONE" as const,
    },
  ],
  diagnostics: [],
};
const identity: GameMetadataResult["identity"] = {
  ref: envelope.evidence[0].ref,
  name: "Example game",
  aliases: [],
  classification: "ORIGINAL",
  relatedGames: [],
  evidenceIds: ["identity"],
};
const metadata = (): GameMetadataResult => ({
  ...structuredClone(envelope),
  identity: structuredClone(identity),
  description: { state: "absent" },
  platforms: { state: "absent" },
  releases: { state: "absent" },
  companies: { state: "absent" },
  images: { state: "absent" },
  videos: { state: "absent" },
  ratings: { state: "absent" },
  playtime: { state: "absent" },
});
const search = (): GameSearchPage => ({
  ...structuredClone(envelope),
  candidates: [
    {
      identity: structuredClone(identity),
      platforms: { state: "absent" },
      firstRelease: { state: "absent" },
      descriptionExcerpt: { state: "absent" },
    },
  ],
  nextCursor: null,
});

it("does not manufacture limitations when available evidence validates", () => {
  expect(evidenceWarnings(null, null)).toEqual([]);
  expect(evidenceWarnings(null, search())).toEqual([]);
  expect(evidenceWarnings(metadata(), null)).toEqual([]);
});

it("warns about partial search context before identity selection without exposing diagnostics", () => {
  const result = search();
  result.candidates[0].platforms = { state: "invalid" };
  result.candidates[0].descriptionExcerpt = {
    state: "limited",
    data: {
      value: "Excerpt",
      scope: { kind: "GAME" },
      evidenceIds: ["identity"],
    },
  };
  const retained = structuredClone(result);
  expect(evidenceWarnings(null, result)).toEqual([
    "Search evidence is incomplete. Missing platforms, dates or identity details do not rule out a match; check the source before choosing.",
  ]);
  expect(result).toEqual(retained);
});

it("explains invalid supported evidence and missing identity data without including provider text", () => {
  const result = metadata();
  result.description = { state: "invalid" };
  result.companies = { state: "invalid" };
  result.diagnostics = [
    {
      section: "identity",
      code: "UNKNOWN_MAPPING",
      itemKey: "UNTRUSTED-PROVIDER-TEXT",
    },
  ];
  const retained = structuredClone(result);
  const warnings = evidenceWarnings(result, null);
  expect(warnings).toEqual([
    "Some game identity details are missing, unsupported or truncated. Check the selected game before applying suggestions.",
    "Description evidence could not be validated and is unavailable for import.",
    "Developer evidence could not be validated and is unavailable for import.",
  ]);
  expect(JSON.stringify(warnings)).not.toContain("UNTRUSTED-PROVIDER-TEXT");
  expect(result).toEqual(retained);
});
