import { z } from "zod";
import {
  normalizedWebUrl,
  catalogReference,
} from "@/features/catalog/validation";
export const editions = [
  "STANDARD",
  "LIMITED",
  "SPECIAL",
  "COLLECTORS",
  "DELUXE",
  "GREATEST_HITS",
  "PLAYERS_CHOICE",
  "PLATINUM",
  "BUDGET",
  "RE_RELEASE",
  "BUNDLE",
  "CUSTOM",
] as const;
export const componentKinds = [
  "PACKAGING",
  "MEDIA",
  "MANUAL",
  "EXTRA",
] as const;
export const creditRoles = [
  "DEVELOPER",
  "PORT_DEVELOPER",
  "PUBLISHER",
  "DISTRIBUTOR",
] as const;
const text = (max = 4000) => z.string().trim().max(max);
const name = text(200).min(1, "Enter a name.");
const optional = (max = 4000) => text(max).transform((v) => v || null);
const part = (max: number) =>
  z
    .string()
    .regex(/^\d*$/)
    .refine((v) => !v || (Number(v) >= 1 && Number(v) <= max))
    .transform((v) => (v ? Number(v) : null));
const year = part(9999);
const slug = text(200).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Use lowercase letters, numbers and single hyphens.",
);
const aliases = text(8000)
  .transform((v) => [
    ...new Set(
      v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(name).max(30));
export const releaseMarket = z
  .strictObject({ regionId: z.uuid(), year, month: part(12), day: part(31) })
  .superRefine((v, ctx) => {
    if ((v.month && !v.year) || (v.day && !v.month))
      ctx.addIssue({
        code: "custom",
        message: "A month needs a year; a day needs a month.",
        path: ["day"],
      });
    if (v.year && v.month && v.day) {
      const leap =
        v.year % 4 === 0 && (v.year % 100 !== 0 || v.year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (v.day > days[v.month - 1])
        ctx.addIssue({
          code: "custom",
          message: "Use a valid calendar date.",
          path: ["day"],
        });
    }
  });
const developer = z.strictObject({
  companyId: z.uuid(),
  creditLabel: optional(200),
});
const credit = developer.extend({
  role: z.enum(creditRoles),
  regionId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
});
export const includedItem = z.strictObject({
  id: z.uuid().optional(),
  name,
  kind: z.enum(componentKinds),
  description: optional(),
  quantity: z.number().int().min(1).max(10000),
});
export const gameFields = z
  .strictObject({
    name,
    slug,
    description: optional(16000),
    aliases,
    developers: z.array(developer).max(30),
  })
  .refine(
    (v) =>
      new Set(v.developers.map((d) => d.companyId)).size ===
      v.developers.length,
    "Remove duplicate developers.",
  );
export const releaseFields = z
  .strictObject({
    slug,
    gameId: z.uuid(),
    platformId: z.uuid(),
    editionName: optional(200),
    editionType: z.enum(editions),
    printingLabel: optional(200),
    firstReleaseYear: year,
    languages: text(4000)
      .transform((v) => [
        ...new Set(
          v
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ])
      .pipe(z.array(text(100).min(1)).max(50)),
    descriptionOverride: optional(16000),
    regionLock: z
      .enum(["", "UNRESTRICTED", "RESTRICTED", "NOT_APPLICABLE"])
      .transform((v) => v || null),
    regionLockNote: optional(),
    identificationStatus: z.enum(["INCOMPLETE", "CONFIRMED"]),
    markets: z.array(releaseMarket).max(30),
    credits: z.array(credit).max(60),
    includedItems: z.array(includedItem).max(100),
  })
  .superRefine((v, ctx) => {
    const markets = new Set(v.markets.map((m) => m.regionId));
    if (markets.size !== v.markets.length)
      ctx.addIssue({ code: "custom", message: "Remove duplicate markets." });
    if (v.credits.some((c) => c.regionId && !markets.has(c.regionId)))
      ctx.addIssue({
        code: "custom",
        message: "A scoped credit must use one of this release's markets.",
      });
    if (
      new Set(
        v.credits.map((c) => JSON.stringify([c.companyId, c.role, c.regionId])),
      ).size !== v.credits.length
    )
      ctx.addIssue({ code: "custom", message: "Remove duplicate credits." });
    const ids = v.includedItems.flatMap((c) => (c.id ? [c.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Remove duplicate component references.",
      });
  });
const scope = {
  references: z.array(catalogReference).max(30).default([]),
  id: z.uuid().optional(),
  expectedRevision: z.number().int().min(1).max(2147483646).optional(),
};
export const gameSave = z
  .discriminatedUnion("kind", [
    z.strictObject({ ...scope, kind: z.literal("game"), fields: gameFields }),
    z.strictObject({
      ...scope,
      kind: z.literal("release"),
      fields: releaseFields,
    }),
  ])
  .refine(
    (v) => Boolean(v.id) === Boolean(v.expectedRevision),
    "An existing record requires its current revision.",
  )
  .superRefine((value, ctx) => {
    const ids = value.references.flatMap((r) => (r.id ? [r.id] : []));
    const keys = value.references.map((r) => {
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
        path: ["references"],
      });
  });
export const gameArchive = z.strictObject({
  kind: z.enum(["game", "release"]),
  id: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
  archived: z.boolean(),
});
export const gamePage = z.strictObject({
  kind: z.enum(["game", "release"]).default("game"),
  id: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  archived: z.enum(["active", "archived", "all"]).default("active"),
});
export type GameFields = z.input<typeof gameFields>;
export type ReleaseFields = z.input<typeof releaseFields>;
export type GameSave = z.output<typeof gameSave>;
export type GameKind = "game" | "release";
export const emptyGame: GameFields = {
  name: "",
  slug: "",
  description: "",
  aliases: "",
  developers: [],
};
export const emptyRelease: ReleaseFields = {
  slug: "",
  gameId: "",
  platformId: "",
  editionName: "",
  editionType: "STANDARD",
  printingLabel: "",
  firstReleaseYear: "",
  languages: "",
  descriptionOverride: "",
  regionLock: "",
  regionLockNote: "",
  identificationStatus: "INCOMPLETE",
  markets: [],
  credits: [],
  includedItems: [],
};
