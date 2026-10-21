import "server-only";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { TransactionClient } from "@/server/db/transaction";
import { latestFieldSources } from "@/server/repositories/catalog/provenance";
import { readEnrichmentTarget } from "@/server/repositories/catalog/enrichment";
import { storedTrailer } from "@/features/games/trailer-validation";
import type {
  AssetAttribution,
  FieldAttribution,
  GameProvenance,
  MetadataAttribution,
} from "@/features/provenance/contracts";

const text = (max: number) => z.string().trim().min(1).max(max);
const timestamp = z.iso.datetime();
const imported = z.object({
  schemaVersion: z.literal(1),
  data: z.object({
    provider: text(100),
    retrievedAt: timestamp,
    scope: z.enum(["GAME", "RELEASE", "ACCESSORY"]),
    mappingVersion: text(64),
    transformation: z
      .enum(["COPY", "APPEND_PRESERVING_EXISTING", "WHOLE_ESTIMATE_SET"])
      .optional(),
    evidence: z
      .array(
        z.object({
          sourceUrl: z.string().nullable(),
          sourceUpdatedAt: timestamp.nullable(),
          normalization: text(64),
        }),
      )
      .min(1)
      .max(512),
  }),
});
const origins = z.enum(["MANUAL", "SEED", "PROVIDER", "AI_ASSISTED"]);
export function safeSourceLink(value: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
type SourceRecord = {
  origin: unknown;
  sourceSnapshot: unknown;
  snapshotSchemaVersion: number;
  createdAt: Date;
};
export function describeMetadataSource(
  row: SourceRecord | undefined,
): MetadataAttribution {
  const unknown: MetadataAttribution = {
    origin: "UNKNOWN",
    recordedAt: null,
    source: null,
    note: "Source not recorded.",
  };
  if (!row) return unknown;
  if (row.snapshotSchemaVersion !== 1)
    return { ...unknown, note: "Source details use an unsupported version." };
  const origin = origins.safeParse(row.origin);
  if (!origin.success) return unknown;
  const attribution: MetadataAttribution = {
    origin: origin.data,
    recordedAt: row.createdAt.toISOString(),
    source: null,
    note: null,
  };
  if (origin.data === "MANUAL") return attribution;
  const parsed =
    Buffer.byteLength(JSON.stringify(row.sourceSnapshot) ?? "") <= 1024 * 1024
      ? imported.safeParse(row.sourceSnapshot)
      : null;
  if (!parsed?.success)
    return {
      ...attribution,
      note: "Detailed source information was not recorded in a supported format.",
    };
  const data = parsed.data.data;
  return {
    ...attribution,
    source: {
      name: data.provider,
      retrievedAt: data.retrievedAt,
      updatedAt: [
        ...new Set(
          data.evidence.flatMap((item) =>
            item.sourceUpdatedAt ? [item.sourceUpdatedAt] : [],
          ),
        ),
      ]
        .sort()
        .slice(0, 20),
      urls: [
        ...new Set(
          data.evidence.flatMap((item) => {
            const url = safeSourceLink(item.sourceUrl);
            return url ? [url] : [];
          }),
        ),
      ].slice(0, 20),
      scope:
        data.scope === "GAME"
          ? "Game-level evidence"
          : data.scope === "RELEASE"
            ? "Release-level evidence"
            : "Accessory product evidence",
      transformations: [
        ...(data.transformation === "APPEND_PRESERVING_EXISTING"
          ? ["Sourced entries added while retaining existing values."]
          : []),
        ...[
          ...new Set(data.evidence.map((item) => item.normalization)),
        ].flatMap((method) =>
          method === "SECONDS_TO_MINUTES"
            ? ["Durations converted from seconds to minutes."]
            : method === "PLAIN_TEXT"
              ? ["Description normalized to plain text."]
              : method === "PARTIAL_DATE"
                ? ["Original date precision retained."]
                : [],
        ),
      ],
      confidence: null,
    },
  };
}
function equivalent(field: string, recorded: unknown, value: unknown) {
  // Manual trailer history also records approval. Approval does not change the metadata's source.
  if (
    field === "trailer" &&
    recorded &&
    typeof recorded === "object" &&
    !Array.isArray(recorded) &&
    "publicApproved" in recorded
  ) {
    const { publicApproved, ...reference } = recorded;
    void publicApproved;
    recorded = reference;
  }
  return isDeepStrictEqual(recorded, value);
}
export function verifiedFieldOrigin(
  field: string,
  value: unknown,
  row:
    | { origin: string; after: unknown; snapshotSchemaVersion: number }
    | undefined,
): string | undefined {
  return row?.snapshotSchemaVersion === 1 &&
    equivalent(field, row.after, value) &&
    origins.safeParse(row.origin).success
    ? row.origin
    : undefined;
}
const labels: Record<string, string> = {
  name: "Title",
  description: "Description",
  aliases: "Other names",
  developers: "Developers",
  references: "External references",
  trailer: "Trailer",
  playtime: "Playtime",
  descriptionOverride: "Release description",
  firstReleaseYear: "Release year",
  credits: "Company credits",
  markets: "Market dates",
};
async function targetSources(
  kind: "game" | "release",
  id: string,
  tx: TransactionClient,
): Promise<FieldAttribution[]> {
  const loaded = await readEnrichmentTarget(kind, id, tx);
  if (!loaded) throw new Error("Catalog target unavailable");
  const { record, playtime, trailer } = loaded;
  const values: Record<string, unknown> = {
    references: record.externalReferences,
    trailer: trailer ? storedTrailer(trailer) : null,
    playtime: playtime
      ? {
          mainMinutes: playtime.mainMinutes,
          mainExtrasMinutes: playtime.mainExtrasMinutes,
          completionistMinutes: playtime.completionistMinutes,
          sourceType: playtime.sourceType,
          sourceName: playtime.sourceName,
          sourceUrl: playtime.sourceUrl,
          observedAt: playtime.observedAt.toISOString(),
        }
      : null,
  };
  if ("gameId" in record)
    Object.assign(values, {
      descriptionOverride: record.descriptionOverride,
      firstReleaseYear: record.firstReleaseYear,
      credits: record.companies.map(
        ({ companyId, role, regionId, creditLabel }) => ({
          companyId,
          role,
          regionId,
          creditLabel,
        }),
      ),
      markets: record.regions.map((r) => ({
        regionId: r.regionId,
        year: r.releaseYear,
        month: r.releaseMonth,
        day: r.releaseDay,
      })),
    });
  else
    Object.assign(values, {
      name: record.name,
      description: record.description,
      aliases: record.aliases,
      developers: record.companies.map(({ companyId, creditLabel }) => ({
        companyId,
        creditLabel,
      })),
    });
  const latest = new Map(
    (await latestFieldSources(kind, id, Object.keys(values), tx)).map((row) => [
      row.fieldPath,
      row,
    ]),
  );
  const fieldOrder =
    kind === "game"
      ? [
          "name",
          "description",
          "aliases",
          "developers",
          "references",
          "trailer",
          "playtime",
        ]
      : [
          "descriptionOverride",
          "firstReleaseYear",
          "credits",
          "markets",
          "references",
          "trailer",
          "playtime",
        ];
  return fieldOrder.map((field) => {
    const value = values[field];
    const row = latest.get(field);
    const hasValue =
      value !== null &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0);
    const source =
      row && !equivalent(field, row.after, value)
        ? {
            ...describeMetadataSource(undefined),
            note: "The current value has no matching source record.",
          }
        : describeMetadataSource(row);
    return { field, label: labels[field], hasValue, ...source };
  });
}
// Internal read projection; callers own the private-read authorization and snapshot transaction.
export async function readGameProvenance(
  gameId: string,
  releaseId: string,
  tx: TransactionClient,
): Promise<GameProvenance> {
  const [game, release] = await Promise.all([
    targetSources("game", gameId, tx),
    targetSources("release", releaseId, tx),
  ]);
  return { game, release };
}
export function assetAttribution(row: {
  sourceType: string;
  provider: string | null;
  sourceUrl: string | null;
  author: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  usageRestrictions: string | null;
  retrievedAt: Date | null;
}): AssetAttribution {
  const recorded = (value: string | null) => (value?.trim() ? value : null);
  return {
    type: row.sourceType,
    provider: recorded(row.provider),
    url: safeSourceLink(row.sourceUrl),
    author: recorded(row.author),
    licenseName: recorded(row.licenseName),
    licenseUrl: safeSourceLink(row.licenseUrl),
    attribution: recorded(row.attribution),
    restrictions: recorded(row.usageRestrictions),
    retrievedAt: row.retrievedAt?.toISOString() ?? null,
  };
}
