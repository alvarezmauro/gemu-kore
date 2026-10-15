import { z } from "zod";
import { normalizedWebUrl } from "../validation";

// This module is a data contract only. It has no database, request or environment dependencies.
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const slug = text(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const year = z.number().int().min(1).max(9999).nullable().optional();
const key = (kind: string) =>
  text(160).regex(new RegExp(`^${kind}:[a-z0-9]+(?:[.-][a-z0-9]+)*$`));
const webUrl = text(2048).refine((value) => {
  try {
    normalizedWebUrl(value);
    return true;
  } catch {
    return false;
  }
}, "Use an HTTP/HTTPS URL without credentials.");
const aliases = z
  .array(text(200))
  .max(30)
  .refine(
    (values) => new Set(values).size === values.length,
    "Remove duplicate aliases.",
  )
  .optional();
const source = z.strictObject({
  title: text(200),
  url: webUrl,
  checkedOn: z.iso.date(),
});
const provenance = z
  .strictObject({
    sources: z.array(source).max(10),
    note: text(2000).optional(),
  })
  .refine(
    (value) => value.sources.length > 0 || Boolean(value.note),
    "Provide a source or an explicit curation note.",
  );
const reference = z
  .strictObject({
    provider: text(100).regex(
      /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
      "Use a lowercase provider key.",
    ),
    providerObjectType: optionalText(100),
    externalId: optionalText(300),
    url: webUrl.nullable().optional(),
  })
  .refine(
    (value) => Boolean(value.externalId || value.url),
    "Provide an external ID or URL.",
  )
  .refine(
    (value) => !value.externalId || Boolean(value.providerObjectType),
    "External IDs require an object type.",
  );
const references = z
  .array(reference)
  .max(30)
  .superRefine((values, ctx) => {
    const identities = new Set<string>();
    values.forEach((ref, index) => {
      let identity: string;
      try {
        identity = JSON.stringify(
          ref.externalId
            ? [ref.provider, ref.providerObjectType, ref.externalId]
            : [ref.provider, ref.url ? normalizedWebUrl(ref.url) : null],
        );
      } catch {
        return;
      } // The URL validator reports malformed input.
      if (identities.has(identity))
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "Duplicate reference identity on this record.",
        });
      identities.add(identity);
    });
  })
  .optional();
const common = {
  name: text(200),
  slug,
  description: optionalText(4000),
  provenance,
};
const company = z.strictObject({
  ...common,
  seedKey: key("company"),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  foundedYear: year,
  website: webUrl.nullable().optional(),
  aliases,
  references,
});
const region = z
  .strictObject({
    ...common,
    seedKey: key("region"),
    code: text(40).regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/),
  })
  .refine(
    (value) =>
      !/^(?:PAL|NTSC|SECAM|REGION[-_]?FREE|RF)$/.test(value.code) &&
      !/^(?:PAL|NTSC|SECAM|region[\s-]*free|unknown)$/i.test(value.name),
    "Markets cannot be video standards, region-lock settings or unknown placeholders.",
  );
const platform = z
  .strictObject({
    ...common,
    seedKey: key("platform"),
    manufacturerSeedKey: key("company").nullable().optional(),
    generation: z.number().int().min(1).max(100).nullable().optional(),
    originalReleaseYear: year,
    discontinuedYear: year,
    history: optionalText(16000),
    aliases,
    references,
  })
  .refine(
    (value) =>
      !value.originalReleaseYear ||
      !value.discontinuedYear ||
      value.discontinuedYear >= value.originalReleaseYear,
    "Discontinued year cannot precede release year.",
  );
const measurement = (digits: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,3})?$`))
    .refine(
      (value) => Number(value) > 0,
      "Measurements must be positive decimal strings with up to three fractional digits.",
    )
    .nullable()
    .optional();
function validJson(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= 200 && value.every((child) => validJson(child, depth + 1))
    );
  if (typeof value === "object")
    return Object.entries(value).every(
      ([name, child]) =>
        !["__proto__", "prototype", "constructor"].includes(name) &&
        validJson(child, depth + 1),
    );
  return false;
}
const specifications = z
  .strictObject({
    schemaVersion: z.literal(1),
    data: z.custom<Record<string, unknown>>(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        validJson(value) &&
        JSON.stringify(value).length <= 16000,
      "Specifications must contain a JSON object: at most 16,000 characters, 10 levels deep and 200 entries per array, without unsafe property names.",
    ),
  })
  .nullable()
  .optional();
const model = z
  .strictObject({
    ...common,
    seedKey: key("model"),
    platformSeedKey: key("platform"),
    manufacturerSeedKey: key("company").nullable().optional(),
    modelNumber: optionalText(200),
    releaseYear: year,
    discontinuedYear: year,
    identificationStatus: z.enum(["INCOMPLETE", "CONFIRMED"]),
    regionSeedKeys: z
      .array(key("region"))
      .max(30)
      .refine(
        (values) => new Set(values).size === values.length,
        "Remove duplicate markets.",
      )
      .optional(),
    regionLock: z
      .enum(["UNRESTRICTED", "RESTRICTED", "NOT_APPLICABLE"])
      .nullable()
      .optional(),
    regionLockNote: optionalText(4000),
    widthMm: measurement(7),
    heightMm: measurement(7),
    depthMm: measurement(7),
    weightGrams: measurement(9),
    specifications,
    references,
  })
  .refine(
    (value) =>
      !value.releaseYear ||
      !value.discontinuedYear ||
      value.discontinuedYear >= value.releaseYear,
    "Discontinued year cannot precede release year.",
  );
const bundle = z.strictObject({
  schemaVersion: z.literal(1),
  companies: z.array(company).max(2000),
  regions: z.array(region).max(2000),
  platforms: z.array(platform).max(2000),
  models: z.array(model).max(2000),
});
export const consoleSeedFiles = [
  {
    path: "companies/companies.json",
    schema: bundle.pick({ schemaVersion: true, companies: true }),
  },
  {
    path: "regions/regions.json",
    schema: bundle.pick({ schemaVersion: true, regions: true }),
  },
  {
    path: "consoles/platforms.json",
    schema: bundle.pick({ schemaVersion: true, platforms: true }),
  },
  {
    path: "consoles/models.json",
    schema: bundle.pick({ schemaVersion: true, models: true }),
  },
] as const;
export const consoleSeedSchema = bundle.superRefine((value, ctx) => {
  for (const category of [
    "companies",
    "regions",
    "platforms",
    "models",
  ] as const) {
    for (const field of [
      "seedKey",
      "slug",
      ...(category === "regions" ? (["code"] as const) : []),
    ] as const) {
      const seen = new Set<string>();
      value[category].forEach((record, index) => {
        const current =
          field === "code" && "code" in record
            ? record.code
            : field === "code"
              ? ""
              : record[field];
        if (seen.has(current))
          ctx.addIssue({
            code: "custom",
            path: [category, index, field],
            message: `Duplicate ${field} within ${category}.`,
          });
        seen.add(current);
      });
    }
  }
  const companies = new Set(value.companies.map((record) => record.seedKey));
  const platforms = new Set(value.platforms.map((record) => record.seedKey));
  const regions = new Map(
    value.regions.map((record) => [record.seedKey, record]),
  );
  for (const category of ["platforms", "models"] as const)
    value[category].forEach((record, index) => {
      if (
        record.manufacturerSeedKey &&
        !companies.has(record.manufacturerSeedKey)
      )
        ctx.addIssue({
          code: "custom",
          path: [category, index, "manufacturerSeedKey"],
          message: "Company seed key is not defined in this dataset.",
        });
    });
  value.models.forEach((record, index) => {
    if (!platforms.has(record.platformSeedKey))
      ctx.addIssue({
        code: "custom",
        path: ["models", index, "platformSeedKey"],
        message: "Platform seed key is not defined in this dataset.",
      });
    for (const [marketIndex, seedKey] of (
      record.regionSeedKeys ?? []
    ).entries())
      if (!regions.has(seedKey))
        ctx.addIssue({
          code: "custom",
          path: ["models", index, "regionSeedKeys", marketIndex],
          message: "Market seed key is not defined in this dataset.",
        });
    if (
      (record.regionSeedKeys?.length ?? 0) > 1 &&
      record.regionSeedKeys?.some((seedKey) => {
        const market = regions.get(seedKey);
        return (
          market &&
          (market.code === "WORLDWIDE" ||
            market.code === "WW" ||
            /^worldwide$/i.test(market.name))
        );
      })
    )
      ctx.addIssue({
        code: "custom",
        path: ["models", index, "regionSeedKeys"],
        message: "Worldwide cannot be combined with specific markets.",
      });
  });
});
export type ConsoleSeedData = z.output<typeof consoleSeedSchema>;
