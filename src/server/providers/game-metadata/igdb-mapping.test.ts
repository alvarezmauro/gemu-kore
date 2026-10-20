import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import base from "../../../../tests/fixtures/game-metadata/igdb-game.json";
import cases from "../../../../tests/fixtures/game-metadata/mapping-cases.json";
import {
  gameMetadataResult,
  gameSearchPage,
  validateProviderOutput,
  type Section,
} from "./contracts";
import { mapGame, mapSearch, parseGameRows } from "./igdb-mapping";

const retrievedAt = "2026-10-19T12:00:00.000Z";
const time = {
  id: 99,
  game_id: 42,
  count: 12,
  hastily: 1800,
  normally: 3600,
  completely: 7200,
  updated_at: 1760000000,
};
const game = (patch: Record<string, unknown> = {}) => ({
  ...structuredClone(base),
  ...patch,
});
const map = (patch: Record<string, unknown> = {}, playtime: unknown = [time]) =>
  mapGame(game(patch), playtime, retrievedAt);
function data<T>(section: Section<T>): T {
  if (!("data" in section))
    throw new Error(`Expected usable evidence, got ${section.state}`);
  return section.data;
}

describe("IGDB identity and release fixtures", () => {
  it.each(cases.identities)(
    "preserves $label identity without creating a physical release",
    ({ input, classification }) => {
      const result = map(input);
      expect(result.identity.classification).toBe(classification);
      expect(result.identity.ref).toEqual({
        provider: "IGDB",
        objectType: "GAME",
        externalId: "42",
      });
      expect(result.identity).not.toHaveProperty("editionType");
      if ("parent_game" in input || "version_parent" in input)
        expect(result.identity.relatedGames).toEqual([
          { provider: "IGDB", objectType: "GAME", externalId: "30" },
        ]);
    },
  );
  it.each(cases.dates)(
    "retains date precision: $label",
    ({ input, expected }) => {
      const result = map({
        release_dates: [{ ...base.release_dates[0], ...input }],
      });
      const release = data(result.releases)[0];
      expect(release.value.date).toEqual(expected);
      expect(release.scope).toEqual({
        kind: "RELEASE_OBSERVATION",
        key: release.value.key,
      });
      expect(
        result.evidence.find(
          (source) => source.ref.objectType === "RELEASE_DATE",
        ),
      ).toMatchObject({
        originalValue: 807235200,
        normalization: "PARTIAL_DATE",
      });
    },
  );
  it.each(cases.markets)(
    "maps commercial market only: $label",
    ({ region, expected }) => {
      const result = map({
        release_dates: [
          {
            ...base.release_dates[0],
            release_region: { id: 900, region },
            region: 8,
          },
        ],
      });
      expect(data(result.releases)[0].value.market).toBe(expected);
      if (expected === null)
        expect(result.diagnostics).toContainEqual({
          section: "releases",
          code: "UNKNOWN_MAPPING",
        });
    },
  );
  it("does not convert legacy or unexpanded region IDs into Worldwide", () => {
    for (const release_region of [null, 8, { id: 8 }]) {
      expect(
        data(
          map({
            release_dates: [
              { ...base.release_dates[0], release_region, region: 8 },
            ],
          }).releases,
        )[0].value.market,
      ).toBeNull();
    }
  });
  it.each([
    { game: 43 },
    { platform: 19 },
    { platform: { id: 0, name: "Invalid" } },
    { id: -1 },
  ])(
    "omits an unresolved/mismatched release without losing its game",
    (patch) => {
      const result = map({
        release_dates: [{ ...base.release_dates[0], ...patch }],
      });
      expect(result.releases).toEqual({ state: "invalid" });
      expect(result.identity.name).toBe("Orbit Quest");
    },
  );
  it("deduplicates repeated observations and rejects conflicting records with the same observation identity", () => {
    expect(
      data(
        map({ release_dates: [base.release_dates[0], base.release_dates[0]] })
          .releases,
      ),
    ).toHaveLength(1);
    expect(() =>
      map({
        release_dates: [
          base.release_dates[0],
          { ...base.release_dates[0], y: 2001 },
        ],
      }),
    ).toThrow("INVALID_RESPONSE");
  });
  it("uses a timestamp day only when full-date precision and matching year/month are evidenced", () => {
    const release = {
      ...base.release_dates[0],
      date_format: { format: "YYYYMMMMDD" },
      date: 808444800,
    };
    expect(
      data(map({ release_dates: [release] }).releases)[0].value.date,
    ).toMatchObject({ precision: "DAY", day: 15 });
    expect(
      data(map({ release_dates: [{ ...release, y: 1996 }] }).releases)[0].value
        .date.precision,
    ).toBe("UNKNOWN");
  });
  it("preserves distinct candidates with the same title and never merges a remake", () => {
    const result = mapSearch(
      [
        game(),
        game({ id: 43, game_type: { type: "Remake" }, parent_game: 42 }),
      ],
      retrievedAt,
      null,
    );
    expect(
      result.candidates.map((candidate) => candidate.identity.ref.externalId),
    ).toEqual(["42", "43"]);
    expect(
      result.candidates.map((candidate) => candidate.identity.classification),
    ).toEqual(["ORIGINAL", "REMAKE"]);
    expect(new Set(result.evidence.map((source) => source.id)).size).toBe(
      result.evidence.length,
    );
    expect(() => mapSearch([game(), game()], retrievedAt, null)).toThrow(
      "INVALID_RESPONSE",
    );
  });
});

describe("IGDB score, duration and source fixtures", () => {
  it.each(cases.ratings)(
    "keeps rating scales and kinds separate: $label",
    ({ value, expected }) => {
      const result = map({ rating: value });
      const scores = data(result.ratings).map((fact) => fact.value);
      expect(
        scores
          .filter((score) => score.kind === "COMMUNITY")
          .map((score) => score.value),
      ).toEqual(expected === null ? [] : [expected]);
      expect(scores.find((score) => score.kind === "CRITIC")).toEqual({
        kind: "CRITIC",
        value: 82,
        maximum: 100,
        sampleCount: 8,
      });
      expect(scores.find((score) => score.kind === "COMBINED")?.value).toBe(
        84.65,
      );
    },
  );
  it.each([-1, 0.5, "12", null, 9007199254740992])(
    "keeps invalid rating sample counts unknown: %s",
    (count) => {
      expect(
        data(map({ rating_count: count }).ratings)[0].value.sampleCount,
      ).toBeNull();
    },
  );
  it("does not turn age certifications into review scores", () => {
    const result = map({
      rating: null,
      aggregated_rating: null,
      total_rating: null,
      age_ratings: [{ rating: 18, category: 1 }],
    });
    expect(result.ratings).toEqual({ state: "absent" });
  });
  it.each(cases.playtime)(
    "normalizes sampled durations: $label",
    ({ input, minutes, state }) => {
      const result = map({}, [{ ...time, ...input }]);
      expect(result.playtime.state).toBe(state);
      expect(data(result.playtime).value).toEqual({
        mainMinutes: minutes,
        mainExtrasMinutes: 60,
        completionistMinutes: 120,
        sampleCount: 12,
      });
      if (minutes !== null)
        expect(result.evidence).toContainEqual(
          expect.objectContaining({
            fieldPath: "hastily",
            originalValue: input.hastily,
            normalization: "SECONDS_TO_MINUTES",
          }),
        );
    },
  );
  it.each([0, -1, 0.5, null, "12"])(
    "requires a real submission count: %s",
    (count) => {
      expect(map({}, [{ ...time, count }]).playtime).toEqual({
        state: "invalid",
      });
    },
  );
  it("keeps nonmonotonic duration categories and unknown categories separate", () => {
    expect(
      data(
        map({}, [{ ...time, hastily: 7200, normally: null, completely: 1800 }])
          .playtime,
      ).value,
    ).toMatchObject({
      mainMinutes: 120,
      mainExtrasMinutes: null,
      completionistMinutes: 30,
    });
  });
  it.each(
    [
      {},
      [null],
      [{ ...time, id: 0 }],
      [{ ...time, game_id: 43 }],
      [time, time],
    ].map((input) => ({ input })),
  )("rejects malformed playtime groups", ({ input }) => {
    expect(map({}, input).playtime.state).toBe("invalid");
  });
  it("distinguishes no estimates, unavailable endpoint, and entirely unknown categories", () => {
    expect(map({}, []).playtime.state).toBe("absent");
    expect(mapGame(game(), undefined, retrievedAt).playtime.state).toBe(
      "unsupported",
    );
    expect(
      map({}, [{ ...time, hastily: null, normally: null, completely: null }])
        .playtime.state,
    ).toBe("absent");
  });
  it.each([null, "yesterday", -62135596801, 253402300800])(
    "does not invent provider update timestamps: %s",
    (updated_at) => {
      const result = map({ updated_at }, [{ ...time, updated_at }]);
      expect(
        result.evidence
          .filter((source) =>
            ["GAME", "PLAYTIME"].includes(source.ref.objectType),
          )
          .every(
            (source) =>
              source.sourceUpdatedAt === null &&
              source.retrievedAt === retrievedAt,
          ),
      ).toBe(true);
    },
  );
  it("normalizes an old first-release timestamp as a year and records the original scalar", () => {
    const result = mapSearch(
      [game({ first_release_date: -315619200 })],
      retrievedAt,
      null,
    );
    expect(data(result.candidates[0].firstRelease).value).toEqual({
      precision: "YEAR",
      year: 1960,
      month: null,
      day: null,
      quarter: null,
    });
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        fieldPath: "first_release_date",
        originalValue: -315619200,
      }),
    );
  });
});

describe("IGDB optional data, media and provenance boundaries", () => {
  it.each([
    ["developer", "DEVELOPER"],
    ["publisher", "PUBLISHER"],
    ["porting", "PORT_DEVELOPER"],
    ["supporting", "SUPPORTING"],
  ])(
    "retains broad %s evidence without assigning physical-edition credits",
    (role, expectedRole) => {
      const result = map({
        involved_companies: [
          {
            id: 88,
            game: 42,
            company: { id: 7, name: "Studio" },
            [role]: true,
            region: "Japan",
            platform: 19,
          },
        ],
      });
      const credit = data(result.companies)[0];
      expect(credit.value.role).toBe(expectedRole);
      expect(credit.scope).toEqual({ kind: "GAME" });
      expect(credit.value).not.toHaveProperty("market");
      expect(credit.value).not.toHaveProperty("platformId");
      expect(
        credit.evidenceIds.map(
          (id) =>
            result.evidence.find((source) => source.id === id)?.ref.objectType,
        ),
      ).toEqual(["COMPANY_CREDIT", "COMPANY"]);
    },
  );
  it("retains unresolved company roles for review and omits mismatched games", () => {
    expect(
      data(
        map({
          involved_companies: [
            {
              ...base.involved_companies[0],
              developer: false,
              publisher: false,
            },
          ],
        }).companies,
      )[0].value.role,
    ).toBe("UNKNOWN");
    expect(
      map({ involved_companies: [{ ...base.involved_companies[0], game: 43 }] })
        .companies.state,
    ).toBe("invalid");
  });
  it.each([
    "../secret",
    "https://127.0.0.1/image",
    "key?token=secret",
    "key/extra",
    "key#fragment",
    "",
    "<img>",
  ])("refuses unsafe image identifiers: %s", (image_id) => {
    const result = map({
      cover: { ...base.cover, image_id },
      screenshots: [],
      artworks: [],
    });
    expect(result.images.state).toBe("invalid");
  });
  it("ignores arbitrary image URLs and leaves use rights unknown", () => {
    const result = map({
      cover: { ...base.cover, url: "http://169.254.169.254/metadata" },
    });
    const images = data(result.images);
    expect(images[0].value.url).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/example_cover.jpg",
    );
    expect(
      images.every(
        (image) =>
          image.value.rights === "UNKNOWN" && image.scope.kind === "GAME",
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("169.254.169.254");
  });
  it.each([
    "<iframe>",
    "https://youtube.com/watch?v=video123_45",
    "video123_45?x=1",
    "short",
    null,
  ])("refuses non-ID video input: %s", (video_id) => {
    expect(
      map({ videos: [{ ...base.videos[0], video_id }] }).videos.state,
    ).toBe("invalid");
  });
  it.each([
    "http://igdb.com/games/test",
    "https://igdb.com.evil.test/game",
    "https://user:secret@igdb.com/game",
    "https://igdb.com:8443/game",
    "javascript:alert(1)",
  ])("does not accept unsafe evidence URLs: %s", (url) => {
    const result = map({ url });
    expect(
      result.evidence
        .filter((source) => source.ref.objectType === "GAME")
        .every((source) => source.sourceUrl === null),
    ).toBe(true);
  });
  it("removes evidence URL query strings and fragments", () => {
    expect(
      map({
        url: "https://www.igdb.com/games/orbit-quest?token=secret#private",
      }).evidence[0].sourceUrl,
    ).toBe("https://www.igdb.com/games/orbit-quest");
  });
  it.each([
    ["platforms", "platforms"],
    ["release_dates", "releases"],
    ["involved_companies", "companies"],
    ["videos", "videos"],
  ] as const)(
    "distinguishes absent, empty and malformed %s arrays",
    (key, section) => {
      expect(map({ [key]: null })[section].state).toBe("absent");
      expect(map({ [key]: [] })[section].state).toBe("absent");
      expect(map({ [key]: "bad" })[section].state).toBe("invalid");
    },
  );
  it("limits each section deterministically and bounds diagnostics", () => {
    const result = map({
      platforms: Array.from({ length: 35 }, (_, i) => ({
        id: i + 1,
        name: `Platform ${i}`,
      })),
      release_dates: Array.from({ length: 35 }, (_, i) => ({
        ...base.release_dates[0],
        id: i + 1,
      })),
      involved_companies: Array.from({ length: 65 }, (_, i) => ({
        ...base.involved_companies[0],
        id: i + 1,
        company: { id: i + 1, name: `Studio ${i}` },
      })),
      screenshots: Array.from({ length: 25 }, (_, i) => ({
        ...base.screenshots[0],
        id: i + 1,
      })),
      videos: Array.from({ length: 8 }, (_, i) => ({
        ...base.videos[0],
        id: i + 1,
      })),
    });
    for (const [section, count] of [
      [result.platforms, 30],
      [result.releases, 30],
      [result.companies, 60],
      [result.images, 20],
      [result.videos, 5],
    ] as const) {
      expect(section.state).toBe("limited");
      expect(data<unknown[]>(section)).toHaveLength(count);
    }
    const invalid = map({
      alternative_names: Array(40).fill(null),
      platforms: Array(40).fill(null),
      release_dates: Array(40).fill(null),
    });
    expect(invalid.diagnostics).toHaveLength(50);
  });
  it("keeps valid members when an optional array is partly malformed", () => {
    const result = map({
      platforms: [19, null, base.platforms[0]],
      videos: [null, base.videos[0]],
    });
    expect(result.platforms.state).toBe("limited");
    expect(data(result.platforms)).toHaveLength(1);
    expect(result.videos.state).toBe("limited");
    expect(data(result.videos)).toHaveLength(1);
  });
  it("normalizes text and bounds search excerpts/platforms without changing source data", () => {
    const input = game({
      name: "  Orbit Quest  ",
      summary: "<p>A &quot;quest&quot; &amp; puzzle.\u0000</p>",
      alternative_names: [{ name: "Alias" }, { name: "Alias" }, { name: " " }],
    });
    const original = structuredClone(input);
    expect(data(mapGame(input, [time], retrievedAt).description).value).toBe(
      'A "quest" & puzzle.',
    );
    expect(input).toEqual(original);
    const search = mapSearch(
      [
        game({
          summary: "x".repeat(501),
          platforms: Array.from({ length: 12 }, (_, i) => ({
            id: i + 1,
            name: `Platform ${i}`,
          })),
        }),
      ],
      retrievedAt,
      null,
    ).candidates[0];
    expect(search.descriptionExcerpt.state).toBe("limited");
    expect(data(search.descriptionExcerpt).value).toHaveLength(500);
    expect(search.platforms.state).toBe("limited");
    expect(data(search.platforms)).toHaveLength(10);
  });
  it("does not pass through raw provider records, private values or metadata bags", () => {
    const result = map({
      notes: "PRIVATE-SENTINEL",
      metadata: { token: "TOKEN-SENTINEL" },
      serialNumber: "SERIAL-SENTINEL",
      location: "LOCATION-SENTINEL",
      game_type: { type: "Main Game", raw_secret: "RAW-SENTINEL" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /(?:PRIVATE|TOKEN|SERIAL|LOCATION|RAW)-SENTINEL/,
    );
  });
  it.each(
    [null, {}, [null], [42], Array(2).fill(base)].map((input) => ({ input })),
  )(
    "rejects invalid root payloads or unexpected record counts",
    ({ input }) => {
      expect(() => parseGameRows(input, 1)).toThrow("INVALID_RESPONSE");
    },
  );
  it("validates evidence links, target scopes and output size independently of mapping", () => {
    const result = map();
    const missing = structuredClone(result);
    missing.description = {
      state: "present",
      data: {
        value: "Description",
        evidenceIds: ["missing"],
        scope: { kind: "GAME" },
      },
    };
    expect(() => validateProviderOutput(gameMetadataResult, missing)).toThrow();
    const duplicate = structuredClone(result);
    duplicate.evidence.push(duplicate.evidence[0]);
    expect(() =>
      validateProviderOutput(gameMetadataResult, duplicate),
    ).toThrow();
    const wrong = structuredClone(result);
    data(wrong.releases)[0].value.game.externalId = "43";
    expect(() => validateProviderOutput(gameMetadataResult, wrong)).toThrow();
    const orphan = structuredClone(result);
    data(orphan.description).scope = {
      kind: "RELEASE_OBSERVATION",
      key: "unknown",
    };
    expect(() => validateProviderOutput(gameMetadataResult, orphan)).toThrow();
    const large = structuredClone(result);
    large.evidence.push(
      ...Array.from({ length: 512 - large.evidence.length }, (_, i) => ({
        ...result.evidence[0],
        id: `large:${i}`,
        sourceUrl: `https://www.igdb.com/${"x".repeat(1900)}`,
      })),
    );
    expect(() => validateProviderOutput(gameMetadataResult, large)).toThrow(
      "budget",
    );
  });
  it("rejects contradictory candidates with the same selection identity", () => {
    const result = mapSearch([game()], retrievedAt, null);
    const other = structuredClone(result.candidates[0]);
    other.identity.name = "A different game using the same provider ID";
    result.candidates.push(other);
    expect(() => validateProviderOutput(gameSearchPage, result)).toThrow();
  });
  it("rejects contradictory trailers with the same selection identity", () => {
    const result = map();
    const videos = data(result.videos);
    videos.push({
      ...structuredClone(videos[0]),
      value: {
        ...videos[0].value,
        title: "A different video using the same provider ID",
        video: { provider: "YOUTUBE", id: "abcdefghijk" },
      },
    });
    expect(() => validateProviderOutput(gameMetadataResult, result)).toThrow();
  });
  it("refuses contradictory raw trailer identities before publishing a normalized result", () => {
    expect(() =>
      map({
        videos: [
          base.videos[0],
          { ...base.videos[0], name: "Other trailer", video_id: "abcdefghijk" },
        ],
      }),
    ).toThrow("INVALID_RESPONSE");
  });
});
