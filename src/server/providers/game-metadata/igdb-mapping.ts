import "server-only";

import { z } from "zod";

import {
  gameMetadataResult,
  gameSearchPage,
  validateProviderOutput,
  type CompanyCreditEvidence,
  type EvidenceSource,
  type GameIdentity,
  type GameMetadataResult,
  type GameSearchPage,
  type ImageCandidate,
  type PartialDateEvidence,
  type PlatformEvidence,
  type PlaytimeEvidence,
  type ProviderDiagnostic,
  type ProviderObjectRef,
  type RatingEvidence,
  type ReleaseObservation,
  type Section,
  type Sourced,
  type VideoCandidate,
} from "./contracts";
import { ProviderFailure } from "./http";

type Row = Record<string, unknown>;
const object = z.record(z.string(), z.unknown());
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const name = z.string().trim().min(1).max(200);
export const MAPPING_VERSION = "igdb-v1";
const gameScope = { kind: "GAME" } as const;

export function externalRef(
  type: ProviderObjectRef["objectType"],
  value: unknown,
): ProviderObjectRef {
  const result = positiveId.safeParse(value);
  if (!result.success) throw new ProviderFailure("INVALID_RESPONSE");
  return {
    provider: "IGDB",
    objectType: type,
    externalId: String(result.data),
  };
}
export function providerId(value: string): string {
  if (!/^[1-9][0-9]{0,15}$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new ProviderFailure("INVALID_INPUT");
  return value;
}
function row(value: unknown): Row | null {
  const parsed = object.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function integer(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}
function sourceTime(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < -62135596800 ||
    value > 253402300799
  )
    return null;
  return new Date(value * 1000).toISOString();
}
function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["www.igdb.com", "igdb.com"].includes(url.hostname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function plainText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length > 32000) return null;
  const text = value
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
        })[entity] ?? entity,
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return text.length > 0 && text.length <= maximum ? text : null;
}

function dateEvidence(raw: Row): PartialDateEvidence {
  const unknown: PartialDateEvidence = {
    precision: "UNKNOWN",
    year: null,
    month: null,
    day: null,
    quarter: null,
  };
  const format = row(raw.date_format)?.format;
  if (typeof format !== "string") return unknown;
  const normalized = format.toUpperCase().replace(/[-_\s]/g, "");
  if (normalized === "TBD") return unknown;
  const year = integer(raw.y, 9999);
  if (year === null || year < 1) return unknown;
  const base = { ...unknown, year };
  if (normalized === "YYYY") return { ...base, precision: "YEAR" };
  const quarter = /^YYYYQ([1-4])$/.exec(normalized);
  if (quarter)
    return { ...base, precision: "QUARTER", quarter: Number(quarter[1]) };
  const month = integer(raw.m, 12);
  if (month === null || month < 1) return unknown;
  if (["YYYYMMMM", "YYYYMM"].includes(normalized))
    return { ...base, precision: "MONTH", month };
  if (!["YYYYMMMMDD", "YYYYMMDD"].includes(normalized)) return unknown;
  // d is documented; a timestamp can supply a day only for a known full-date format.
  const instant = sourceTime(raw.date);
  const derived = instant ? new Date(instant) : null;
  const day =
    integer(raw.d, 31) ??
    (derived &&
    derived.getUTCFullYear() === year &&
    derived.getUTCMonth() + 1 === month
      ? derived.getUTCDate()
      : null);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day === null || day < 1 || day > days[month - 1]) return unknown;
  return { ...base, precision: "DAY", month, day };
}

class Mapping {
  evidence: EvidenceSource[] = [];
  diagnostics: ProviderDiagnostic[] = [];
  constructor(
    readonly retrievedAt: string,
    readonly game: Row,
  ) {}

  diagnostic(
    section: string,
    code: ProviderDiagnostic["code"] = "INVALID_OPTIONAL",
  ) {
    if (this.diagnostics.length < 50) this.diagnostics.push({ section, code });
  }

  source(
    ref: ProviderObjectRef,
    raw: Row,
    fieldPath: string,
    normalization: EvidenceSource["normalization"] = "NONE",
    originalValue?: number | string | null,
  ): string {
    const id = `e${this.evidence.length + 1}`;
    this.evidence.push({
      id,
      ref,
      fieldPath,
      retrievedAt: this.retrievedAt,
      sourceUrl: sourceUrl(raw.url) ?? sourceUrl(this.game.url),
      sourceUpdatedAt: sourceTime(raw.updated_at),
      normalization,
      ...(originalValue !== undefined ? { originalValue } : {}),
    });
    return id;
  }

  fact<T>(
    value: T,
    ref: ProviderObjectRef,
    raw: Row,
    path: string,
    normalization: EvidenceSource["normalization"] = "NONE",
    originalValue?: number | string | null,
  ): Sourced<T> {
    return {
      value,
      evidenceIds: [this.source(ref, raw, path, normalization, originalValue)],
      scope: gameScope,
    };
  }

  list<T>(
    raw: unknown,
    section: string,
    limit: number,
    map: (entry: Row) => Sourced<T> | null,
  ): Section<Sourced<T>[]> {
    if (raw === undefined || raw === null) return { state: "absent" };
    if (!Array.isArray(raw)) {
      this.diagnostic(section);
      return { state: "invalid" };
    }
    if (raw.length === 0) return { state: "absent" };
    let invalid = false;
    const data: Sourced<T>[] = [];
    const keys = new Set<string>();
    for (const value of raw.slice(0, limit)) {
      let mapped: Sourced<T> | null = null;
      try {
        const entry = row(value);
        mapped = entry ? map(entry) : null;
      } catch (error) {
        if (!(error instanceof ProviderFailure)) throw error;
      }
      if (!mapped) {
        invalid = true;
        this.diagnostic(section);
        continue;
      }
      const key = JSON.stringify(mapped.value);
      if (!keys.has(key)) {
        keys.add(key);
        data.push(mapped);
      }
    }
    const limited = raw.length > limit || invalid;
    if (raw.length > limit) this.diagnostic(section, "LIMIT_REACHED");
    return data.length
      ? { state: limited ? "limited" : "present", data }
      : { state: "invalid" };
  }

  identity(): GameIdentity {
    const ref = externalRef("GAME", this.game.id);
    const parsedName = name.safeParse(this.game.name);
    if (!parsedName.success) throw new ProviderFailure("INVALID_RESPONSE");
    const aliases: string[] = [];
    const evidenceIds = [this.source(ref, this.game, "name")];
    const alternatives = this.game.alternative_names;
    if (alternatives !== undefined && !Array.isArray(alternatives))
      this.diagnostic("identity");
    if (Array.isArray(alternatives)) {
      if (alternatives.length > 30)
        this.diagnostic("identity", "LIMIT_REACHED");
      for (const alternative of alternatives.slice(0, 30)) {
        const alias = name.safeParse(row(alternative)?.name);
        if (alias.success && !aliases.includes(alias.data))
          aliases.push(alias.data);
        else if (!alias.success) this.diagnostic("identity");
      }
      if (aliases.length)
        evidenceIds.push(this.source(ref, this.game, "alternative_names.name"));
    }
    const type = row(this.game.game_type)?.type;
    const classifications: Record<string, GameIdentity["classification"]> = {
      "main game": "ORIGINAL",
      port: "PORT",
      remake: "REMAKE",
      remaster: "REMASTER",
      bundle: "COMPILATION",
      compilation: "COMPILATION",
    };
    const classification =
      typeof type === "string" &&
      Object.hasOwn(classifications, type.toLowerCase())
        ? classifications[type.toLowerCase()]
        : "UNKNOWN";
    if (classification === "UNKNOWN")
      this.diagnostic("identity", "UNKNOWN_MAPPING");
    evidenceIds.push(this.source(ref, this.game, "game_type.type"));
    const relatedGames: ProviderObjectRef[] = [];
    for (const key of ["parent_game", "version_parent"] as const) {
      if (this.game[key] !== undefined) {
        try {
          relatedGames.push(externalRef("GAME", this.game[key]));
          evidenceIds.push(this.source(ref, this.game, key));
        } catch {
          this.diagnostic("identity");
        }
      }
    }
    return {
      ref,
      name: parsedName.data,
      aliases,
      classification,
      relatedGames,
      evidenceIds,
    };
  }

  platforms(limit = 30): Section<Sourced<PlatformEvidence>[]> {
    return this.list(this.game.platforms, "platforms", limit, (entry) => {
      const parsed = name.safeParse(entry.name);
      if (!parsed.success) return null;
      const ref = externalRef("PLATFORM", entry.id);
      return this.fact({ ref, name: parsed.data }, ref, entry, "name");
    });
  }

  description(maximum = 16000): Section<Sourced<string>> {
    if (this.game.summary === undefined) return { state: "absent" };
    const text = plainText(this.game.summary, 16000);
    if (!text) {
      this.diagnostic("description");
      return { state: "invalid" };
    }
    if (text.length > maximum) this.diagnostic("description", "LIMIT_REACHED");
    return {
      state: text.length > maximum ? "limited" : "present",
      data: this.fact(
        text.slice(0, maximum),
        externalRef("GAME", this.game.id),
        this.game,
        "summary",
        "PLAIN_TEXT",
      ),
    };
  }

  releases(): Section<Sourced<ReleaseObservation>[]> {
    return this.list(this.game.release_dates, "releases", 30, (entry) => {
      if (entry.game !== this.game.id) return null;
      const platform = row(entry.platform);
      const platformName = name.safeParse(platform?.name);
      if (!platform || !platformName.success) return null;
      const ref = externalRef("RELEASE_DATE", entry.id);
      const key = `release:${ref.externalId}`;
      const date = dateEvidence(entry);
      if (date.precision === "UNKNOWN")
        this.diagnostic("releases", "UNKNOWN_MAPPING");
      const marketNames: Record<string, ReleaseObservation["market"]> = {
        europe: "EUROPE",
        north_america: "NORTH_AMERICA",
        australia: "AUSTRALIA",
        new_zealand: "NEW_ZEALAND",
        japan: "JAPAN",
        china: "CHINA",
        asia: "ASIA",
        worldwide: "WORLDWIDE",
        korea: "KOREA",
        brazil: "BRAZIL",
      };
      const label = row(entry.release_region)?.region;
      const marketKey =
        typeof label === "string"
          ? label.toLowerCase().replace(/[ -]/g, "_")
          : "";
      const market = Object.hasOwn(marketNames, marketKey)
        ? marketNames[marketKey]
        : null;
      if (market === null) this.diagnostic("releases", "UNKNOWN_MAPPING");
      const status = name.safeParse(row(entry.status)?.name);
      return {
        value: {
          key,
          ref,
          game: externalRef("GAME", this.game.id),
          platform: {
            ref: externalRef("PLATFORM", platform.id),
            name: platformName.data,
          },
          market,
          date,
          status: status.success ? status.data : null,
        },
        scope: { kind: "RELEASE_OBSERVATION", key },
        evidenceIds: [
          this.source(
            ref,
            entry,
            "date_format.format,date,y,m,d,platform,release_region.region,status.name",
            "PARTIAL_DATE",
            typeof entry.date === "number" && Number.isFinite(entry.date)
              ? entry.date
              : undefined,
          ),
        ],
      };
    });
  }

  companies(): Section<Sourced<CompanyCreditEvidence>[]> {
    // The API supplies broad involved-company records, not physical-edition credits.
    const credits: Row[] = [];
    const raw = this.game.involved_companies;
    if (raw === undefined || raw === null) return { state: "absent" };
    if (!Array.isArray(raw)) {
      this.diagnostic("companies");
      return { state: "invalid" };
    }
    let invalid = false;
    for (const value of raw.slice(0, 60)) {
      const entry = row(value);
      if (!entry || entry.game !== this.game.id) {
        invalid = true;
        this.diagnostic("companies");
        continue;
      }
      const roles: [string, CompanyCreditEvidence["role"]][] = [
        ["developer", "DEVELOPER"],
        ["publisher", "PUBLISHER"],
        ["porting", "PORT_DEVELOPER"],
        ["supporting", "SUPPORTING"],
      ];
      const selected = roles.filter(([field]) => entry[field] === true);
      if (!selected.length) this.diagnostic("companies", "UNKNOWN_MAPPING");
      for (const [field, role] of selected.length
        ? selected
        : ([["unknown", "UNKNOWN"]] as typeof roles))
        credits.push({
          ...entry,
          role,
          roleField:
            field === "unknown"
              ? "developer,publisher,porting,supporting"
              : field,
        });
    }
    const result = this.list<CompanyCreditEvidence>(
      credits,
      "companies",
      60,
      (entry) => {
        const company = row(entry.company);
        const parsedName = name.safeParse(company?.name);
        if (!company || !parsedName.success) return null;
        const creditRef = externalRef("COMPANY_CREDIT", entry.id);
        const ref = externalRef("COMPANY", company.id);
        return {
          value: {
            ref,
            name: parsedName.data,
            role: entry.role as CompanyCreditEvidence["role"],
          },
          scope: gameScope,
          evidenceIds: [
            this.source(creditRef, entry, String(entry.roleField)),
            this.source(ref, company, "name"),
          ],
        };
      },
    );
    if (raw.length > 60 || invalid) {
      this.diagnostic("companies", "LIMIT_REACHED");
      if ("data" in result) result.state = "limited";
      else if (invalid) return { state: "invalid" };
    }
    return result;
  }

  images(): Section<Sourced<ImageCandidate>[]> {
    const images: Row[] = [];
    let invalid = false;
    let limited = false;
    for (const [key, type] of [
      ["cover", "COVER"],
      ["screenshots", "SCREENSHOT"],
      ["artworks", "ARTWORK"],
    ] as const) {
      const raw = this.game[key];
      if (raw === undefined || raw === null) continue;
      const values = key === "cover" ? [raw] : raw;
      if (!Array.isArray(values)) {
        invalid = true;
        this.diagnostic("images");
        continue;
      }
      if (values.length > 20) limited = true;
      for (const value of values.slice(0, 20)) {
        const entry = row(value);
        if (!entry || entry.game !== this.game.id) {
          invalid = true;
          this.diagnostic("images");
          continue;
        }
        images.push({ ...entry, type });
      }
    }
    const result = this.list<ImageCandidate>(images, "images", 20, (entry) => {
      if (
        typeof entry.image_id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(entry.image_id)
      )
        return null;
      const purpose = entry.type as ImageCandidate["purpose"];
      const ref = externalRef(purpose, entry.id);
      const value: ImageCandidate = {
        ref,
        purpose,
        url: `https://images.igdb.com/igdb/image/upload/t_${purpose === "COVER" ? "cover_big" : "screenshot_big"}/${entry.image_id}.jpg`,
        width: integer(entry.width, 100000) || null,
        height: integer(entry.height, 100000) || null,
        rights: "UNKNOWN",
      };
      return this.fact(
        value,
        ref,
        entry,
        "image_id,game,width,height",
        "FIXED_MEDIA_URL",
      );
    });
    if (limited || invalid) {
      this.diagnostic("images", limited ? "LIMIT_REACHED" : "INVALID_OPTIONAL");
      if ("data" in result) result.state = "limited";
      else if (invalid) return { state: "invalid" };
    }
    return result;
  }

  videos(): Section<Sourced<VideoCandidate>[]> {
    return this.list(this.game.videos, "videos", 5, (entry) => {
      if (
        entry.game !== this.game.id ||
        typeof entry.video_id !== "string" ||
        !/^[A-Za-z0-9_-]{11}$/.test(entry.video_id)
      )
        return null;
      const title = name.safeParse(entry.name);
      const ref = externalRef("VIDEO", entry.id);
      return this.fact(
        {
          ref,
          title: title.success ? title.data : null,
          video: { provider: "YOUTUBE", id: entry.video_id },
        },
        ref,
        entry,
        "video_id,game,name",
      );
    });
  }

  ratings(): Section<Sourced<RatingEvidence>[]> {
    const data: Sourced<RatingEvidence>[] = [];
    let invalid = false;
    for (const [field, kind] of [
      ["rating", "COMMUNITY"],
      ["aggregated_rating", "CRITIC"],
      ["total_rating", "COMBINED"],
    ] as const) {
      const value = this.game[field];
      if (value === undefined || value === null) continue;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      ) {
        invalid = true;
        this.diagnostic("ratings");
        continue;
      }
      data.push(
        this.fact(
          {
            kind,
            value,
            maximum: 100,
            sampleCount: integer(this.game[`${field}_count`]),
          },
          externalRef("GAME", this.game.id),
          this.game,
          `${field},${field}_count`,
          "RATING_SCALE_100",
        ),
      );
    }
    return data.length
      ? { state: invalid ? "limited" : "present", data }
      : { state: invalid ? "invalid" : "absent" };
  }

  playtime(raw: unknown): Section<Sourced<PlaytimeEvidence>> {
    if (raw === undefined) {
      this.diagnostic("playtime", "UNAVAILABLE_SECTION");
      return { state: "unsupported" };
    }
    if (!Array.isArray(raw) || raw.length > 1) {
      this.diagnostic("playtime");
      return { state: "invalid" };
    }
    if (!raw.length) return { state: "absent" };
    const entry = row(raw[0]);
    const count = integer(entry?.count);
    if (
      !entry ||
      entry.game_id !== this.game.id ||
      count === null ||
      count <= 0
    ) {
      this.diagnostic("playtime");
      return { state: "invalid" };
    }
    let ref: ProviderObjectRef;
    try {
      ref = externalRef("PLAYTIME", entry.id);
    } catch {
      this.diagnostic("playtime");
      return { state: "invalid" };
    }
    const evidenceIds: string[] = [];
    let invalid = false;
    const duration = (field: string) => {
      const seconds = integer(entry[field]);
      if (entry[field] === undefined || entry[field] === null) return null;
      if (seconds === null || seconds <= 0 || seconds > 2147483647 * 60) {
        invalid = true;
        this.diagnostic(
          "playtime",
          seconds === 0 ? "AMBIGUOUS_ZERO" : "INVALID_OPTIONAL",
        );
        return null;
      }
      evidenceIds.push(
        this.source(ref, entry, field, "SECONDS_TO_MINUTES", seconds),
      );
      return Math.max(1, Math.round(seconds / 60));
    };
    const value: PlaytimeEvidence = {
      mainMinutes: duration("hastily"),
      mainExtrasMinutes: duration("normally"),
      completionistMinutes: duration("completely"),
      sampleCount: count,
    };
    if (!evidenceIds.length) return { state: invalid ? "invalid" : "absent" };
    evidenceIds.push(this.source(ref, entry, "count"));
    return {
      state: invalid ? "limited" : "present",
      data: { value, evidenceIds, scope: gameScope },
    };
  }
}

export function parseGameRows(raw: unknown, maximum: number): Row[] {
  const parsed = z.array(object).max(maximum).safeParse(raw);
  if (!parsed.success) throw new ProviderFailure("INVALID_RESPONSE");
  return parsed.data;
}

function checked<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return validateProviderOutput(schema, data);
  } catch {
    throw new ProviderFailure("INVALID_RESPONSE");
  }
}

export function mapGame(
  game: Row,
  playtime: unknown,
  retrievedAt: string,
): GameMetadataResult {
  const mapping = new Mapping(retrievedAt, game);
  const identity = mapping.identity();
  const result = {
    schemaVersion: 1,
    provider: "IGDB",
    mappingVersion: MAPPING_VERSION,
    retrievedAt,
    identity,
    description: mapping.description(),
    platforms: mapping.platforms(),
    releases: mapping.releases(),
    companies: mapping.companies(),
    images: mapping.images(),
    videos: mapping.videos(),
    ratings: mapping.ratings(),
    playtime: mapping.playtime(playtime),
    evidence: mapping.evidence,
    diagnostics: mapping.diagnostics,
  };
  return checked(gameMetadataResult, result);
}

export function mapSearch(
  rows: Row[],
  retrievedAt: string,
  nextCursor: string | null,
): GameSearchPage {
  const evidence: EvidenceSource[] = [];
  const diagnostics: ProviderDiagnostic[] = [];
  const seen = new Set<string>();
  const candidates = rows.map((game, index) => {
    const mapping = new Mapping(retrievedAt, game);
    const identity = mapping.identity();
    if (seen.has(identity.ref.externalId))
      throw new ProviderFailure("INVALID_RESPONSE");
    seen.add(identity.ref.externalId);
    const platforms = mapping.platforms(10);
    const descriptionExcerpt = mapping.description(500);
    // Search uses only the conservative year, never a platform/physical-release date.
    const firstInstant = sourceTime(game.first_release_date);
    const firstRelease: Section<Sourced<PartialDateEvidence>> = firstInstant
      ? {
          state: "present",
          data: mapping.fact(
            {
              precision: "YEAR",
              year: new Date(firstInstant).getUTCFullYear(),
              month: null,
              day: null,
              quarter: null,
            },
            identity.ref,
            game,
            "first_release_date",
            "PARTIAL_DATE",
            typeof game.first_release_date === "number"
              ? game.first_release_date
              : undefined,
          ),
        }
      : { state: game.first_release_date === undefined ? "absent" : "invalid" };
    const prefix = `c${index}:`;
    identity.evidenceIds = identity.evidenceIds.map((id) => prefix + id);
    if ("data" in platforms)
      platforms.data.forEach((fact) => {
        fact.evidenceIds = fact.evidenceIds.map((id) => prefix + id);
      });
    if ("data" in descriptionExcerpt)
      descriptionExcerpt.data.evidenceIds =
        descriptionExcerpt.data.evidenceIds.map((id) => prefix + id);
    if ("data" in firstRelease)
      firstRelease.data.evidenceIds = firstRelease.data.evidenceIds.map(
        (id) => prefix + id,
      );
    evidence.push(
      ...mapping.evidence.map((source) => ({
        ...source,
        id: prefix + source.id,
      })),
    );
    diagnostics.push(...mapping.diagnostics);
    return { identity, platforms, firstRelease, descriptionExcerpt };
  });
  return checked(gameSearchPage, {
    schemaVersion: 1,
    provider: "IGDB",
    mappingVersion: MAPPING_VERSION,
    retrievedAt,
    candidates,
    nextCursor,
    evidence,
    diagnostics: diagnostics.slice(0, 50),
  });
}
