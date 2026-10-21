import { z } from "zod";
import {
  catalogReference,
  normalizedWebUrl,
  specifications,
} from "@/features/catalog/validation";
import { trailerReference } from "@/features/games/trailer-validation";
const text = (max = 4000) => z.string().trim().max(max);
const optional = (max = 4000) => text(max).transform((v) => v || null);
const relation = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);
const common = {
  name: text(200).min(1, "Enter a name."),
  slug: text(200).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens.",
  ),
  producerId: relation,
  releaseYear: z
    .string()
    .regex(/^\d*$/)
    .refine(
      (v) => !v || (Number(v) >= 1 && Number(v) <= 9999),
      "Use a year from 1 to 9999.",
    )
    .transform((v) => (v ? Number(v) : null)),
  trailer: trailerReference.nullable(),
};
export const accessoryFields = z.strictObject({
  ...common,
  description: optional(16000),
  specifications,
});
export const variantFields = z.strictObject({
  ...common,
  accessoryId: z.uuid({ error: "Choose an accessory family." }),
  modelNumber: optional(200),
  color: optional(200),
  edition: optional(200),
  descriptionOverride: optional(16000),
  specificationsOverride: specifications,
  regionLock: z
    .enum(["", "UNRESTRICTED", "RESTRICTED", "NOT_APPLICABLE"])
    .transform((v) => v || null),
  regionLockNote: optional(),
  identificationStatus: z.enum(["INCOMPLETE", "CONFIRMED"]),
  regionIds: z
    .array(z.uuid())
    .max(30)
    .refine((v) => new Set(v).size === v.length, "Remove duplicate markets."),
  platforms: z
    .array(
      z.strictObject({ platformId: z.uuid(), compatibilityNote: optional() }),
    )
    .max(30)
    .refine(
      (v) => new Set(v.map((p) => p.platformId)).size === v.length,
      "Remove duplicate compatible platforms.",
    ),
});
const scope = {
  id: z.uuid().optional(),
  expectedRevision: z.number().int().min(1).max(2147483646).optional(),
  references: z.array(catalogReference).max(30).default([]),
};
export const accessorySave = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...scope,
      kind: z.literal("accessory"),
      fields: accessoryFields,
    }),
    z.strictObject({
      ...scope,
      kind: z.literal("variant"),
      fields: variantFields,
      compatibilityCopy: z
        .strictObject({
          sourceId: z.uuid(),
          sourceRevision: z.number().int().positive(),
          reviewed: z.literal(true, {
            error: "Review the copied compatibility list before saving.",
          }),
        })
        .optional(),
    }),
  ])
  .superRefine((v, ctx) => {
    if (Boolean(v.id) !== Boolean(v.expectedRevision))
      ctx.addIssue({
        code: "custom",
        message: "An existing record requires its current revision.",
      });
    if (v.kind === "variant" && v.id && v.compatibilityCopy)
      ctx.addIssue({
        code: "custom",
        message: "Compatibility copying is an initial draft only.",
      });
    const ids = v.references.flatMap((r) => (r.id ? [r.id] : []));
    const keys = v.references.map((r) => {
      let url = r.url;
      try {
        url = r.url ? normalizedWebUrl(r.url) : null;
      } catch {}
      return JSON.stringify(
        r.externalId
          ? [r.provider, r.providerObjectType, r.externalId]
          : [r.provider, url],
      );
    });
    if (new Set(ids).size !== ids.length || new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "Remove duplicate external references.",
      });
  });
export const accessoryArchive = z.strictObject({
  kind: z.enum(["accessory", "variant"]),
  id: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
  archived: z.boolean(),
});
export const accessoryPage = z.strictObject({
  kind: z.enum(["accessory", "variant"]).default("accessory"),
  id: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  archived: z.enum(["active", "archived", "all"]).default("active"),
});
export const compatibilitySource = z.strictObject({
  accessoryId: z.uuid(),
  sourceId: z.uuid(),
});
export const accessoryIdentity = z.strictObject({ id: z.uuid() });
export type AccessoryKind = "accessory" | "variant";
export type AccessoryFields = z.input<typeof accessoryFields>;
export type VariantFields = z.input<typeof variantFields>;
export const emptyAccessory: AccessoryFields = {
  name: "",
  slug: "",
  producerId: "",
  releaseYear: "",
  description: "",
  specifications: "",
  trailer: null,
};
export const emptyVariant: VariantFields = {
  name: "",
  slug: "",
  producerId: "",
  releaseYear: "",
  accessoryId: "",
  modelNumber: "",
  color: "",
  edition: "",
  descriptionOverride: "",
  specificationsOverride: "",
  trailer: null,
  regionLock: "",
  regionLockNote: "",
  identificationStatus: "INCOMPLETE",
  regionIds: [],
  platforms: [],
};
