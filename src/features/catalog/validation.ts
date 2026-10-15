import { z } from "zod";
import { catalogKinds } from "./contracts";
export const catalogKind = z.enum(catalogKinds);
const optionalText = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const year = z
  .string()
  .trim()
  .regex(/^(?:[1-9]\d{0,3})?$/, "Use a year from 1 to 9999.")
  .transform((v) => (v ? Number(v) : null));
const relation = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);
const decimal = (digits: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^(?:\\d{1,${digits}}(?:\\.\\d{1,3})?)?$`),
      "Use a positive measurement with at most three decimal places.",
    )
    .refine((v) => !v || Number(v) > 0)
    .transform((v) => (v ? String(Number(v)) : null));
export function normalizedWebUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without credentials.");
  url.hash = "";
  return url.toString();
}
function safeNormalizedUrl(value: string | null) {
  try {
    return value ? normalizedWebUrl(value) : null;
  } catch {
    return null;
  }
}
const webUrl = optionalText(2048).refine((v) => {
  if (!v) return true;
  try {
    normalizedWebUrl(v);
    return true;
  } catch {
    return false;
  }
}, "Use an HTTP or HTTPS URL without credentials.");
const aliases = z
  .string()
  .max(8000)
  .transform((v) => [
    ...new Set(
      v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(200)).max(30));
const common = {
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens.",
    ),
  description: optionalText(),
};
const company = z.strictObject({
  ...common,
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?:[A-Z]{2})?$/)
    .transform((v) => v || null),
  foundedYear: year,
  website: webUrl,
  aliases,
});
const region = z
  .strictObject({
    ...common,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/),
  })
  .refine(
    (v) =>
      !/^(?:PAL|NTSC|SECAM|REGION[-_]?FREE|RF)$/.test(v.code) &&
      !/^(?:PAL|NTSC|SECAM|region\s*free)$/i.test(v.name),
    {
      message:
        "Use a commercial market, not a video standard or region-lock setting.",
      path: ["code"],
    },
  );
const platform = z
  .strictObject({
    ...common,
    manufacturerId: relation,
    generation: year.refine(
      (v) => v === null || v <= 100,
      "Use a generation from 1 to 100.",
    ),
    originalReleaseYear: year,
    discontinuedYear: year,
    history: optionalText(16000),
    aliases,
  })
  .refine(
    (v) =>
      !v.originalReleaseYear ||
      !v.discontinuedYear ||
      v.discontinuedYear >= v.originalReleaseYear,
    {
      message: "Discontinued year cannot precede release year.",
      path: ["discontinuedYear"],
    },
  );
function validJson(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length <= 200 && value.every((v) => validJson(v, depth + 1));
  if (typeof value === "object")
    return Object.entries(value).every(
      ([key, v]) =>
        !["__proto__", "constructor", "prototype"].includes(key) &&
        validJson(v, depth + 1),
    );
  return false;
}
const specifications = z
  .string()
  .max(16000)
  .transform((v, ctx) => {
    if (!v.trim()) return null;
    try {
      const data: unknown = JSON.parse(v);
      if (
        !data ||
        Array.isArray(data) ||
        typeof data !== "object" ||
        "schemaVersion" in data ||
        !validJson(data)
      )
        throw new Error();
      return { schemaVersion: 1, data };
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Specifications must be a JSON object, at most 10 levels deep, without a schemaVersion wrapper.",
      });
      return z.NEVER;
    }
  });
const model = z
  .strictObject({
    ...common,
    platformId: z.uuid({ error: "Choose a platform." }),
    manufacturerId: relation,
    modelNumber: optionalText(200),
    releaseYear: year,
    discontinuedYear: year,
    widthMm: decimal(7),
    heightMm: decimal(7),
    depthMm: decimal(7),
    weightGrams: decimal(9),
    regionLock: z
      .enum(["", "UNRESTRICTED", "RESTRICTED", "NOT_APPLICABLE"])
      .transform((v) => v || null),
    regionLockNote: optionalText(),
    identificationStatus: z.enum(["INCOMPLETE", "CONFIRMED"]),
    regionIds: z
      .array(z.uuid())
      .max(30)
      .refine((v) => new Set(v).size === v.length),
    specifications,
  })
  .refine(
    (v) =>
      !v.releaseYear ||
      !v.discontinuedYear ||
      v.discontinuedYear >= v.releaseYear,
    {
      message: "Discontinued year cannot precede release year.",
      path: ["discontinuedYear"],
    },
  );
const reference = z
  .strictObject({
    id: z.uuid().optional(),
    provider: z.string().trim().toLowerCase().min(1).max(100),
    providerObjectType: optionalText(100),
    externalId: optionalText(300),
    url: webUrl,
  })
  .refine((v) => Boolean(v.externalId || v.url), {
    message: "Provide an external ID or a URL.",
    path: ["url"],
  })
  .refine((v) => !v.externalId || Boolean(v.providerObjectType), {
    message: "An external ID also needs an object type.",
    path: ["providerObjectType"],
  });
const root = {
  id: z.uuid().optional(),
  expectedRevision: z.number().int().positive().max(2147483646).optional(),
  references: z.array(reference).max(30),
};
export const catalogSave = z
  .discriminatedUnion("kind", [
    z.strictObject({ ...root, kind: z.literal("company"), fields: company }),
    z.strictObject({
      ...root,
      kind: z.literal("region"),
      fields: region,
      references: z.array(reference).max(0),
    }),
    z.strictObject({ ...root, kind: z.literal("platform"), fields: platform }),
    z.strictObject({ ...root, kind: z.literal("model"), fields: model }),
  ])
  .superRefine((v, ctx) => {
    if (Boolean(v.id) !== Boolean(v.expectedRevision))
      ctx.addIssue({
        code: "custom",
        message: "An existing record requires its current revision.",
      });
    const identities = v.references.map((r) =>
      r.externalId
        ? JSON.stringify([r.provider, r.providerObjectType, r.externalId])
        : JSON.stringify([r.provider, safeNormalizedUrl(r.url)]),
    );
    if (
      new Set(identities).size !== identities.length ||
      new Set(v.references.filter((r) => r.id).map((r) => r.id)).size !==
        v.references.filter((r) => r.id).length
    )
      ctx.addIssue({
        code: "custom",
        message: "Remove duplicate external references.",
      });
  });
export const catalogArchive = z.strictObject({
  kind: catalogKind,
  id: z.uuid(),
  expectedRevision: z.number().int().positive().max(2147483646),
  archived: z.boolean(),
});
export const catalogPage = z.strictObject({
  kind: catalogKind.default("platform"),
  page: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .default(1),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  id: z.uuid().optional(),
});
export const catalogLookup = z.strictObject({
  kind: z.enum(["company", "platform", "region"]),
  query: z.string().trim().max(200),
});
export type CatalogSave = z.output<typeof catalogSave>;
