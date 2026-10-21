import { z } from "zod";
import type { EnrichmentValue } from "./contracts";
import type { ProposalField } from "./validation";
export const fieldLabels: Record<ProposalField, string> = {
  name: "Title",
  description: "Description",
  aliases: "Other names",
  developers: "Developers",
  references: "External references",
  trailer: "Trailer",
  playtime: "Playtime",
  descriptionOverride: "Release description",
  credits: "Release company credits",
  markets: "Market dates",
  firstReleaseYear: "Release year",
  releaseYear: "Release year",
  producerId: "Producer",
};
export function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      [
        "igdb.com",
        "www.igdb.com",
        "www.wikidata.org",
        "commons.wikimedia.org",
      ].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
const sourceSchema = z.object({
  schemaVersion: z.literal(1),
  data: z.object({
    provider: z.enum(["IGDB", "WIKIDATA"]),
    retrievedAt: z.iso.datetime(),
    scope: z.enum(["GAME", "ACCESSORY"]),
    evidence: z.array(
      z.object({
        id: z.string(),
        sourceUrl: z.string().nullable(),
        fieldPath: z.string(),
        sourceUpdatedAt: z.string().nullable().optional(),
      }),
    ),
  }),
});
export function sourceDetails(value: EnrichmentValue) {
  const source = sourceSchema.safeParse(value);
  if (!source.success) return null;
  return {
    provider: source.data.data.provider,
    retrievedAt: source.data.data.retrievedAt,
    scope:
      source.data.data.scope === "GAME"
        ? "Game-level evidence"
        : "Accessory product evidence",
    links: [
      ...new Set(
        source.data.data.evidence.flatMap((e) =>
          e.sourceUrl && sourceUrl(e.sourceUrl)
            ? [sourceUrl(e.sourceUrl)!]
            : [],
        ),
      ),
    ],
  };
}
export function displayValue(
  field: ProposalField,
  value: EnrichmentValue,
  companies: { id: string; name: string }[] = [],
): string[] {
  if (
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
    return ["Not recorded"];
  if (field === "producerId" && typeof value === "string")
    return [
      companies.find((c) => c.id === value)?.name ?? "Company name unavailable",
    ];
  if (typeof value === "string" || typeof value === "number")
    return [String(value)];
  if (Array.isArray(value))
    return value.flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (!entry || Array.isArray(entry) || typeof entry !== "object")
        return [];
      if (field === "developers")
        return [
          `${companies.find((c) => c.id === entry.companyId)?.name ?? "Company name unavailable"}${entry.creditLabel ? ` · ${entry.creditLabel}` : ""}`,
        ];
      if (field === "references")
        return [
          `${entry.provider} · ${entry.providerObjectType ?? "Reference"} ${entry.externalId ?? ""}${entry.url ? ` · ${entry.url}` : ""}`,
        ];
      return ["Value unavailable"];
    });
  if (typeof value === "object") {
    if (field === "trailer")
      return [
        value.provider === "YOUTUBE"
          ? `YouTube · ${value.id}`
          : `Video · ${value.url}`,
      ];
    if (field === "playtime")
      return [
        ["Main story", value.mainMinutes],
        ["Main + extras", value.mainExtrasMinutes],
        ["Completionist", value.completionistMinutes],
      ]
        .map(
          ([label, minutes]) =>
            `${label}: ${typeof minutes === "number" ? `${minutes} min` : "Unknown"}`,
        )
        .concat([`Source: ${value.sourceName ?? "Unknown"}`]);
  }
  return ["Value unavailable"];
}
