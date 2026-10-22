import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    throw new Error("Unit tests must not access a database.");
  },
}));
import { gameMetadataResult } from "@/server/providers/game-metadata/contracts";
import type { TargetSnapshot } from "./common";
import { buildProposals, type Choices } from "./proposals";
import { EnrichmentError } from "./errors";
const id = "11111111-1111-4111-8111-111111111111";
const oldCompany = "22222222-2222-4222-8222-222222222222";
const newCompany = "33333333-3333-4333-8333-333333333333";
const time = "2026-10-19T12:00:00.000Z";
const manualReference = {
  provider: "manual",
  providerObjectType: null,
  externalId: null,
  url: "https://example.com/manual-source",
};
function target(): TargetSnapshot {
  return {
    target: { kind: "game", id },
    label: "Manual title",
    revision: 1,
    archived: false,
    identity: {},
    fields: {
      name: "Manual title",
      description: "Manual description",
      aliases: ["Manual alias"],
      developers: [{ companyId: oldCompany, creditLabel: "Manual credit" }],
      references: [manualReference],
      playtime: {
        mainMinutes: 10,
        mainExtrasMinutes: 20,
        completionistMinutes: 30,
        sourceType: "MANUAL",
        sourceName: "Manual timing",
        sourceUrl: null,
        observedAt: time,
      },
    },
  };
}
function choices(
  fields: Choices["fields"],
  extra: Partial<Choices> = {},
): Choices {
  return {
    runId: id,
    expectedRunVersion: 1,
    fields,
    companyBindings: [],
    ...extra,
  };
}
// A normalized contract fixture keeps service tests independent of provider mappers.
function metadata() {
  const ref = { provider: "IGDB", objectType: "GAME", externalId: "42" };
  const sourceUrl = "https://www.igdb.com/games/orbit-quest";
  const sourced = (value: unknown, evidenceId: string) => ({
    value,
    evidenceIds: [evidenceId],
    scope: { kind: "GAME" },
  });
  return gameMetadataResult.parse({
    schemaVersion: 1,
    provider: "IGDB",
    retrievedAt: time,
    mappingVersion: "fixture-1",
    identity: {
      ref,
      name: "Orbit Quest",
      aliases: ["Orbit Quest International"],
      classification: "ORIGINAL",
      relatedGames: [],
      evidenceIds: ["identity"],
    },
    description: {
      state: "present",
      data: sourced("A fictional adventure & puzzle game.", "description"),
    },
    companies: {
      state: "present",
      data: [
        sourced(
          {
            ref: { ...ref, objectType: "COMPANY", externalId: "7" },
            name: "Example Studio",
            role: "DEVELOPER",
          },
          "company",
        ),
      ],
    },
    videos: {
      state: "present",
      data: [
        sourced(
          {
            ref: { ...ref, objectType: "VIDEO", externalId: "18" },
            title: "Example trailer",
            video: { provider: "YOUTUBE", id: "video123_45" },
          },
          "video",
        ),
      ],
    },
    playtime: {
      state: "present",
      data: sourced(
        {
          mainMinutes: 30,
          mainExtrasMinutes: null,
          completionistMinutes: 120,
          sampleCount: 12,
        },
        "playtime",
      ),
    },
    platforms: { state: "unsupported" },
    releases: { state: "unsupported" },
    images: { state: "unsupported" },
    ratings: { state: "unsupported" },
    evidence: ["identity", "description", "company", "video", "playtime"].map(
      (id) => ({
        id,
        ref,
        sourceUrl,
        fieldPath: id,
        retrievedAt: time,
        sourceUpdatedAt: null,
        normalization: "NONE",
      }),
    ),
    diagnostics: [],
  });
}
it("produces only requested reviewable suggestions and preserves manual input objects", () => {
  const snapshot = target(),
    result = metadata(),
    selected = choices(["description"]);
  const retained = structuredClone({ snapshot, result, selected });
  const output = buildProposals(snapshot, result, selected, []);
  expect(output.unavailable).toEqual([]);
  expect(output.proposals).toHaveLength(1);
  expect(output.proposals[0]).toMatchObject({
    fieldPath: "description",
    before: "Manual description",
    proposed: "A fictional adventure & puzzle game.",
    origin: "PROVIDER",
    sourceSnapshot: {
      schemaVersion: 1,
      data: {
        provider: "IGDB",
        retrievedAt: time,
        scope: "GAME",
        transformation: "COPY",
      },
    },
  });
  expect({ snapshot, result, selected }).toEqual(retained);
});
it("appends aliases without losing manual values, order or duplicate suppression", () => {
  const result = metadata();
  result.identity.aliases.push("Manual alias");
  const output = buildProposals(target(), result, choices(["aliases"]), []);
  expect(output.proposals[0]).toMatchObject({
    before: ["Manual alias"],
    proposed: ["Manual alias", "Orbit Quest International"],
  });
});
it("omits normalized no-op suggestions", () => {
  const snapshot = target();
  snapshot.fields.name = "Orbit Quest";
  expect(buildProposals(snapshot, metadata(), choices(["name"]), [])).toEqual({
    proposals: [],
    unavailable: [],
  });
});
it.each(["absent", "unsupported", "invalid"] as const)(
  "does not clear manual descriptions when evidence is %s",
  (state) => {
    const snapshot = target(),
      result = metadata();
    result.description = { state };
    const output = buildProposals(
      snapshot,
      result,
      choices(["description"]),
      [],
    );
    expect(output.proposals).toEqual([]);
    expect(output.unavailable).toEqual([
      {
        field: "description",
        reason: "No supported, scoped evidence is available for this field.",
      },
    ]);
    expect(snapshot.fields.description).toBe("Manual description");
  },
);
it("does not promote game-level evidence to a physical release, but preserves and appends explicit references", () => {
  const snapshot = target();
  snapshot.target = { kind: "release", id };
  const output = buildProposals(
    snapshot,
    metadata(),
    choices(["references", "descriptionOverride"]),
    [],
  );
  expect(output.proposals.map((p) => p.fieldPath)).toEqual(["references"]);
  expect(output.proposals[0].proposed).toEqual([
    manualReference,
    {
      provider: "igdb",
      providerObjectType: "GAME",
      externalId: "42",
      url: "https://www.igdb.com/games/orbit-quest",
    },
  ]);
  expect(output.unavailable).toEqual([
    {
      field: "descriptionOverride",
      reason:
        "The provider match does not establish this physical release's scope. Enrich its Game instead.",
    },
  ]);
});
it("does not duplicate an existing provider identity even when its display URL differs", () => {
  const snapshot = target();
  snapshot.fields.references = [
    {
      provider: "IGDB",
      providerObjectType: "game",
      externalId: "42",
      url: "https://www.igdb.com/games/retained-source",
    },
  ];
  expect(
    buildProposals(snapshot, metadata(), choices(["references"]), []),
  ).toEqual({ proposals: [], unavailable: [] });
});
it("keeps existing developer credits when mappings are missing", () => {
  const snapshot = target(),
    before = structuredClone(snapshot);
  const output = buildProposals(
    snapshot,
    metadata(),
    choices(["developers"]),
    [],
  );
  expect(output.proposals).toEqual([]);
  expect(output.unavailable).toEqual([
    {
      field: "developers",
      reason:
        "Choose an existing active company for every developer; unresolved mappings cannot be applied.",
    },
  ]);
  expect(snapshot).toEqual(before);
});
it("uses explicit company bindings, appends new developers and preserves an existing manual credit", () => {
  const selected = choices(["developers"], {
    companyBindings: [{ externalId: "7", companyId: newCompany }],
  });
  const output = buildProposals(target(), metadata(), selected, [
    { externalId: "7", companyId: newCompany, revision: 1 },
  ]);
  expect(output.proposals[0].proposed).toEqual([
    { companyId: oldCompany, creditLabel: "Manual credit" },
    { companyId: newCompany, creditLabel: null },
  ]);
  const duplicate = buildProposals(
    target(),
    metadata(),
    choices(["developers"], {
      companyBindings: [{ externalId: "7", companyId: oldCompany }],
    }),
    [{ externalId: "7", companyId: oldCompany, revision: 1 }],
  );
  expect(duplicate).toEqual({ proposals: [], unavailable: [] });
});
it("replaces the whole estimate set while keeping unknown durations unknown", () => {
  const result = metadata();
  const snapshot = target();
  const output = buildProposals(snapshot, result, choices(["playtime"]), []);
  expect(output.proposals[0]).toMatchObject({
    before: snapshot.fields.playtime,
    proposed: {
      mainMinutes: 30,
      mainExtrasMinutes: null,
      completionistMinutes: 120,
      sourceType: "PROVIDER",
      sourceName: "IGDB",
      observedAt: time,
    },
    sourceSnapshot: {
      data: {
        transformation: "WHOLE_ESTIMATE_SET",
        recordedAtBasis: "RETRIEVED_AT",
      },
    },
  });
});
it("rejects missing evidence and unchosen trailers instead of guessing their source or selection", () => {
  const result = metadata();
  if (!("data" in result.description))
    throw new Error("Fixture description must have evidence.");
  const ids = result.description.data.evidenceIds;
  result.evidence = result.evidence.filter((e) => !ids.includes(e.id));
  expect(() =>
    buildProposals(target(), result, choices(["description"]), []),
  ).toThrow(EnrichmentError);
  for (const trailerExternalId of [undefined, "999"]) {
    expect(() =>
      buildProposals(
        target(),
        metadata(),
        choices(["trailer"], { trailerExternalId }),
        [],
      ),
    ).toThrow(EnrichmentError);
  }
  expect(
    buildProposals(
      target(),
      metadata(),
      choices(["trailer"], { trailerExternalId: "18" }),
      [],
    ).proposals[0].proposed,
  ).toEqual({ provider: "YOUTUBE", id: "video123_45" });
});
