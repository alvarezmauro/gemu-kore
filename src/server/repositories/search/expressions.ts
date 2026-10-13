import "server-only";
import { Prisma } from "../../db/generated/client";
// These fragments contain only fixed schema identifiers. Values are bound by
// the repository. Keep each row-local expression identical to its SQL index.
const text = (sql: string) => Prisma.raw(sql);
export const canonicalSources = [
  {
    kind: "company",
    table: "company",
    source: "Company",
    priority: 1,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    whole: `ARRAY[s.name] || s.aliases`,
  },
  {
    kind: "platform",
    table: "console_platform",
    source: "Platform",
    priority: 1,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    whole: `ARRAY[s.name] || s.aliases`,
  },
  {
    kind: "model",
    table: "console_model",
    source: "Identity",
    priority: 0,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || COALESCE(s."modelNumber", ''), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, ''), NFC)`,
    whole: `ARRAY[s.name, s."modelNumber"]`,
  },
  {
    kind: "game",
    table: "game",
    source: "Identity",
    priority: 0,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, '') || ' ' || search_alias_text(s.aliases), NFC)`,
    whole: `ARRAY[s.name] || s.aliases`,
  },
  {
    kind: "release",
    table: "game_release",
    source: "Edition",
    priority: 1,
    vectorText: `normalize(COALESCE(s."editionName", '') || ' ' || COALESCE(s."printingLabel", ''), NFC)`,
    fuzzyText: `normalize(COALESCE(s."editionName", '') || ' ' || COALESCE(s."printingLabel", ''), NFC)`,
    whole: `ARRAY[s."editionName", s."printingLabel"]`,
  },
  {
    kind: "accessory",
    table: "accessory",
    source: "Identity",
    priority: 0,
    vectorText: `normalize(COALESCE(s.name, ''), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, ''), NFC)`,
    whole: `ARRAY[s.name]`,
  },
  {
    kind: "variant",
    table: "accessory_variant",
    source: "Identity",
    priority: 0,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || COALESCE(s.edition, '') || ' ' || COALESCE(s.color, '') || ' ' || COALESCE(s."modelNumber", ''), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, '') || ' ' || COALESCE(s.edition, '') || ' ' || COALESCE(s.color, ''), NFC)`,
    whole: `ARRAY[s.name, s.edition, s.color, s."modelNumber"]`,
  },
  {
    kind: "region",
    table: "region",
    source: "Region",
    priority: 1,
    vectorText: `normalize(COALESCE(s.name, '') || ' ' || COALESCE(s.code, ''), NFC)`,
    fuzzyText: `normalize(COALESCE(s.name, ''), NFC)`,
    whole: `ARRAY[s.name, s.code]`,
  },
] as const;
export const fragment = text;
