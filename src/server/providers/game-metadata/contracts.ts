import "server-only";

import { z } from "zod";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const timestamp = z.iso.datetime();
export const providerObjectReference = z.strictObject({
  provider: z.literal("IGDB"),
  objectType: z.enum([
    "GAME",
    "PLATFORM",
    "COMPANY",
    "COMPANY_CREDIT",
    "RELEASE_DATE",
    "COVER",
    "SCREENSHOT",
    "ARTWORK",
    "VIDEO",
    "PLAYTIME",
  ]),
  externalId: text(128),
});
export type ProviderObjectRef = z.infer<typeof providerObjectReference>;
export type ProviderId = ProviderObjectRef["provider"];
const referenceOf = (kind: ProviderObjectRef["objectType"]) =>
  providerObjectReference.refine((ref) => ref.objectType === kind);

export const gameSearchInput = z.strictObject({
  query: text(200)
    .min(2)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  platform: providerObjectReference.optional(),
  year: z.number().int().min(1).max(9999).optional(),
  cursor: text(512).optional(),
  limit: z.number().int().min(1).max(20),
});
export const gameFetchInput = z.strictObject({ game: providerObjectReference });
export type GameSearchInput = z.infer<typeof gameSearchInput>;
export type GameFetchInput = z.infer<typeof gameFetchInput>;
export type ProviderContext = { signal: AbortSignal; deadlineAt: number };
export type ProviderErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CANCELLED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";
export type ProviderResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ProviderErrorCode;
        retryable: boolean;
        retryAfterSeconds?: number;
      };
    };

const scope = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("GAME") }),
  z.strictObject({ kind: z.literal("RELEASE_OBSERVATION"), key: text(128) }),
]);
const evidenceIds = z.array(text(128)).min(1).max(128);
export function sourced<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, evidenceIds, scope });
}
export function section<T extends z.ZodType>(data: T) {
  return z.union([
    z.strictObject({ state: z.enum(["present", "limited"]), data }),
    z.strictObject({ state: z.enum(["absent", "unsupported", "invalid"]) }),
  ]);
}
export type Sourced<T> = {
  value: T;
  evidenceIds: string[];
  scope: z.infer<typeof scope>;
};
export type Section<T> =
  | { state: "present" | "limited"; data: T }
  | { state: "absent" | "unsupported" | "invalid" };

export const evidenceSource = z.strictObject({
  id: text(128),
  ref: providerObjectReference,
  sourceUrl: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    })
    .nullable(),
  fieldPath: text(200),
  retrievedAt: timestamp,
  sourceUpdatedAt: timestamp.nullable(),
  normalization: z.enum([
    "NONE",
    "PLAIN_TEXT",
    "PARTIAL_DATE",
    "RATING_SCALE_100",
    "SECONDS_TO_MINUTES",
    "FIXED_MEDIA_URL",
  ]),
  originalValue: z
    .union([z.string().max(200), z.number().finite(), z.null()])
    .optional(),
});
export type EvidenceSource = z.infer<typeof evidenceSource>;
const diagnostic = z.strictObject({
  code: z.enum([
    "INVALID_OPTIONAL",
    "UNKNOWN_MAPPING",
    "LIMIT_REACHED",
    "UNAVAILABLE_SECTION",
    "AMBIGUOUS_ZERO",
  ]),
  section: text(40),
  itemKey: text(128).optional(),
});
export type ProviderDiagnostic = z.infer<typeof diagnostic>;

const partialDate = z
  .strictObject({
    precision: z.enum(["DAY", "MONTH", "YEAR", "QUARTER", "UNKNOWN"]),
    year: z.number().int().min(1).max(9999).nullable(),
    month: z.number().int().min(1).max(12).nullable(),
    day: z.number().int().min(1).max(31).nullable(),
    quarter: z.number().int().min(1).max(4).nullable(),
  })
  .superRefine((date, ctx) => {
    const leap =
      date.year !== null &&
      date.year % 4 === 0 &&
      (date.year % 100 !== 0 || date.year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const valid = {
      DAY:
        date.year !== null &&
        date.month !== null &&
        date.day !== null &&
        date.quarter === null &&
        date.day <= days[date.month - 1],
      MONTH:
        date.year !== null &&
        date.month !== null &&
        date.day === null &&
        date.quarter === null,
      YEAR:
        date.year !== null &&
        date.month === null &&
        date.day === null &&
        date.quarter === null,
      QUARTER:
        date.year !== null &&
        date.quarter !== null &&
        date.month === null &&
        date.day === null,
      UNKNOWN:
        date.year === null &&
        date.month === null &&
        date.day === null &&
        date.quarter === null,
    }[date.precision];
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message: "Invalid date precision or calendar date.",
      });
  });
export type PartialDateEvidence = z.infer<typeof partialDate>;

const platformEvidence = z.strictObject({
  ref: referenceOf("PLATFORM"),
  name: text(200),
});
export type PlatformEvidence = z.infer<typeof platformEvidence>;
const gameIdentity = z.strictObject({
  ref: referenceOf("GAME"),
  name: text(200),
  aliases: z.array(text(200)).max(30),
  classification: z.enum([
    "ORIGINAL",
    "PORT",
    "REMAKE",
    "REMASTER",
    "COMPILATION",
    "UNKNOWN",
  ]),
  relatedGames: z.array(referenceOf("GAME")).max(30),
  evidenceIds,
});
export type GameIdentity = z.infer<typeof gameIdentity>;
const releaseObservation = z.strictObject({
  key: text(128),
  ref: referenceOf("RELEASE_DATE"),
  game: referenceOf("GAME"),
  platform: platformEvidence,
  market: z
    .enum([
      "EUROPE",
      "NORTH_AMERICA",
      "AUSTRALIA",
      "NEW_ZEALAND",
      "JAPAN",
      "CHINA",
      "ASIA",
      "WORLDWIDE",
      "KOREA",
      "BRAZIL",
    ])
    .nullable(),
  date: partialDate,
  status: text(200).nullable(),
});
export type ReleaseObservation = z.infer<typeof releaseObservation>;
const companyCredit = z.strictObject({
  ref: referenceOf("COMPANY"),
  name: text(200),
  role: z.enum([
    "DEVELOPER",
    "PUBLISHER",
    "PORT_DEVELOPER",
    "SUPPORTING",
    "UNKNOWN",
  ]),
});
export type CompanyCreditEvidence = z.infer<typeof companyCredit>;
const imageCandidate = z.strictObject({
  ref: providerObjectReference,
  url: z
    .string()
    .regex(
      /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_(?:cover_big|screenshot_big)\/[A-Za-z0-9_-]{1,128}\.jpg$/,
    ),
  purpose: z.enum(["COVER", "SCREENSHOT", "ARTWORK"]),
  width: z.number().int().positive().max(100000).nullable(),
  height: z.number().int().positive().max(100000).nullable(),
  rights: z.literal("UNKNOWN"),
});
export type ImageCandidate = z.infer<typeof imageCandidate>;
const videoCandidate = z.strictObject({
  ref: referenceOf("VIDEO"),
  title: text(200).nullable(),
  video: z.strictObject({
    provider: z.literal("YOUTUBE"),
    id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  }),
});
export type VideoCandidate = z.infer<typeof videoCandidate>;
const ratingEvidence = z
  .strictObject({
    kind: z.enum(["COMMUNITY", "CRITIC", "COMBINED"]),
    value: z.number().finite().min(0),
    maximum: z.number().finite().positive(),
    sampleCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
  })
  .refine((rating) => rating.value <= rating.maximum);
export type RatingEvidence = z.infer<typeof ratingEvidence>;
const minutes = z.number().int().min(0).max(2147483647).nullable();
const playtimeEvidence = z
  .strictObject({
    mainMinutes: minutes,
    mainExtrasMinutes: minutes,
    completionistMinutes: minutes,
    sampleCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((value) =>
    [
      value.mainMinutes,
      value.mainExtrasMinutes,
      value.completionistMinutes,
    ].some((v) => v !== null),
  );
export type PlaytimeEvidence = z.infer<typeof playtimeEvidence>;
const envelope = {
  schemaVersion: z.literal(1),
  provider: z.literal("IGDB"),
  retrievedAt: timestamp,
  mappingVersion: text(64),
  evidence: z.array(evidenceSource).max(512),
  diagnostics: z.array(diagnostic).max(50),
};
export const gameSearchPage = z.strictObject({
  ...envelope,
  candidates: z
    .array(
      z.strictObject({
        identity: gameIdentity,
        platforms: section(z.array(sourced(platformEvidence)).max(30)),
        firstRelease: section(sourced(partialDate)),
        descriptionExcerpt: section(sourced(text(500))),
      }),
    )
    .max(20),
  nextCursor: text(512).nullable(),
});
export const gameMetadataResult = z.strictObject({
  ...envelope,
  identity: gameIdentity,
  description: section(sourced(text(16000))),
  platforms: section(z.array(sourced(platformEvidence)).max(30)),
  releases: section(z.array(sourced(releaseObservation)).max(30)),
  companies: section(z.array(sourced(companyCredit)).max(60)),
  images: section(z.array(sourced(imageCandidate)).max(20)),
  videos: section(z.array(sourced(videoCandidate)).max(5)),
  ratings: section(z.array(sourced(ratingEvidence)).max(3)),
  playtime: section(sourced(playtimeEvidence)),
});
export type GameSearchPage = z.infer<typeof gameSearchPage>;
export type GameMetadataResult = z.infer<typeof gameMetadataResult>;

export interface GameMetadataProvider {
  readonly id: ProviderId;
  search(
    input: GameSearchInput,
    context: ProviderContext,
  ): Promise<ProviderResult<GameSearchPage>>;
  fetch(
    input: GameFetchInput,
    context: ProviderContext,
  ): Promise<ProviderResult<GameMetadataResult>>;
}

// Runtime schemas protect our side of the boundary as well as provider responses.
export function validateProviderOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.parse(value);
  if (Buffer.byteLength(JSON.stringify(parsed)) > 512 * 1024)
    throw new Error("Provider output exceeds budget.");
  const envelope = parsed as { evidence: EvidenceSource[] };
  const ids = new Set(envelope.evidence.map((source) => source.id));
  if (ids.size !== envelope.evidence.length)
    throw new Error("Duplicate evidence identity.");
  const result = parsed as GameMetadataResult | GameSearchPage;
  // Choices are submitted by provider identity, so one ID must identify one choice.
  // Existence of evidence IDs alone cannot disambiguate contradictory records.
  const uniqueChoices = (refs: ProviderObjectRef[]) => {
    const keys = refs.map((ref) =>
      JSON.stringify([ref.provider, ref.objectType, ref.externalId]),
    );
    if (new Set(keys).size !== keys.length)
      throw new Error("Ambiguous provider choice identity.");
  };
  if ("candidates" in result)
    uniqueChoices(result.candidates.map((candidate) => candidate.identity.ref));
  if ("videos" in result && "data" in result.videos)
    uniqueChoices(result.videos.data.map((video) => video.value.ref));
  const observations =
    "releases" in result && "data" in result.releases
      ? result.releases.data
      : [];
  const observationKeys = new Set(observations.map((entry) => entry.value.key));
  if (observationKeys.size !== observations.length)
    throw new Error("Duplicate release observation.");
  if (
    "identity" in result &&
    observations.some(
      (entry) =>
        entry.value.game.externalId !== result.identity.ref.externalId ||
        entry.scope.kind !== "RELEASE_OBSERVATION" ||
        entry.scope.key !== entry.value.key,
    )
  )
    throw new Error("Mismatched release observation.");
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    const factScope = record.scope as Sourced<unknown>["scope"] | undefined;
    if (
      factScope?.kind === "RELEASE_OBSERVATION" &&
      !observationKeys.has(factScope.key)
    )
      throw new Error("Unresolved release observation.");
    if (
      Array.isArray(record.evidenceIds) &&
      record.evidenceIds.some((id) => typeof id !== "string" || !ids.has(id))
    )
      throw new Error("Unresolved evidence identity.");
    Object.values(record).forEach(walk);
  };
  walk(parsed);
  return parsed;
}
