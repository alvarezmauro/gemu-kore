import type {
  AccessoryMetadataResult,
  AccessoryMetadataProvider,
  AccessorySearchPage,
} from "../../src/server/providers/accessory-metadata/contracts";
export function accessoryEvidenceFixture(): AccessoryMetadataResult {
  const retrievedAt = "2026-10-20T12:00:00.000Z",
    sourceUrl = "https://www.wikidata.org/wiki/Q42",
    ref = {
      provider: "WIKIDATA" as const,
      objectType: "ITEM" as const,
      externalId: "Q42",
    };
  const fields = [
    "identity",
    "description",
    "releaseYear",
    "producer",
    "video",
    "image",
    "edition",
  ];
  return {
    schemaVersion: 1,
    provider: "WIKIDATA",
    mappingVersion: "1",
    retrievedAt,
    identity: { ref, name: "Synthetic controller", evidenceIds: ["identity"] },
    description: {
      state: "present",
      data: {
        value: "Synthetic sourced controller description",
        evidenceIds: ["description"],
      },
    },
    releaseYear: {
      state: "present",
      data: { value: 2001, evidenceIds: ["releaseYear"] },
    },
    producers: {
      state: "present",
      data: [
        {
          value: { ref: { ...ref, externalId: "Q77" }, name: "Sony" },
          evidenceIds: ["producer"],
        },
      ],
    },
    videos: {
      state: "present",
      data: [
        {
          value: {
            externalId: "dQw4w9WgXcQ",
            title: "Synthetic product video",
            video: { provider: "YOUTUBE", id: "dQw4w9WgXcQ" },
          },
          evidenceIds: ["video"],
        },
      ],
    },
    observations: [
      {
        label: "Product image (source file page)",
        value: "Synthetic controller.png",
        sourceUrl:
          "https://commons.wikimedia.org/wiki/File:Synthetic_controller.png",
        evidenceIds: ["image"],
      },
      {
        label: "Edition observation",
        value: "Synthetic product edition",
        sourceUrl,
        evidenceIds: ["edition"],
      },
    ],
    evidence: fields.map((id) => ({
      id,
      fieldPath: id,
      sourceUrl,
      retrievedAt,
      sourceUpdatedAt: null,
      normalization: "NONE",
    })),
    diagnostics: [],
  };
}
export function accessorySearchFixture(): AccessorySearchPage {
  const result = accessoryEvidenceFixture();
  return {
    schemaVersion: 1,
    provider: "WIKIDATA",
    retrievedAt: result.retrievedAt,
    candidates: [
      {
        identity: result.identity,
        description: "Synthetic controller candidate",
      },
    ],
    diagnostics: [],
  };
}
export function fixtureAccessoryProvider(): AccessoryMetadataProvider {
  return {
    id: "WIKIDATA",
    search: async () => ({ ok: true, data: accessorySearchFixture() }),
    fetch: async () => ({ ok: true, data: accessoryEvidenceFixture() }),
  };
}
