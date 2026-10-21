import "server-only";
import { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import {
  publicMatchesQuery,
  type ParsedTerm,
} from "@/server/repositories/search/query";
import type { Policy } from "./policy";

export type CollectionParameters = {
  q: string;
  limit: number;
  offset: number;
  type?: "CONSOLE" | "GAME" | "ACCESSORY";
  platform?: string;
  region?: string;
  company?: string;
  year?: number;
  location?: string;
  hasBox?: "true" | "false" | "unknown";
  hasDefects?: boolean;
  sort: "relevance" | "name-asc" | "name-desc" | "newest" | "oldest";
};
export type CardRow = {
  id: string;
  type: "CONSOLE" | "GAME" | "ACCESSORY";
  title: string;
  context: string;
  hasBox: boolean | null;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
};
// These facts are canonical relationships of published copies only. No private
// controlRows, private card projection, notes, serials or media are hydrated.
// Materialize facts once: after bulk publication, stale row estimates must not
// turn each matching ID into another execution of all subtype/canonical joins.
function facts(policy: Policy) {
  return Prisma.sql`WITH eligible AS MATERIALIZED (
    SELECT c.id,c.type,c."hasBox",c."createdAt",${policy.showLocations ? Prisma.sql`c."locationId"` : Prisma.sql`NULL::uuid`} location
    FROM collection_item c WHERE c."publicationStatus"='PUBLISHED'
      AND EXISTS(SELECT FROM public_settings WHERE id=1 AND "publicCollectionEnabled")
  ), facts AS MATERIALIZED (
    SELECT e.*,p.name title,m.name context,m."identificationStatus",ARRAY[p.id] platforms,
      ARRAY(SELECT "regionId" FROM console_model_region WHERE "consoleModelId"=m.id) regions,
      array_remove(ARRAY[m."manufacturerId",p."manufacturerId"],NULL) companies,m."releaseYear" AS "year"
    FROM eligible e JOIN owned_console o ON o."collectionItemId"=e.id JOIN console_model m ON m.id=o."consoleModelId" JOIN console_platform p ON p.id=m."platformId"
    UNION ALL
    SELECT e.*,g.name,concat_ws(' · ',p.name,r."editionName",r."printingLabel"),r."identificationStatus",ARRAY[p.id],
      ARRAY(SELECT "regionId" FROM game_release_region WHERE "gameReleaseId"=r.id),
      ARRAY(SELECT "companyId" FROM game_company WHERE "gameId"=g.id UNION SELECT "companyId" FROM game_release_company WHERE "gameReleaseId"=r.id),
      COALESCE((SELECT min("releaseYear") FROM game_release_region WHERE "gameReleaseId"=r.id),r."firstReleaseYear")
    FROM eligible e JOIN owned_game o ON o."collectionItemId"=e.id JOIN game_release r ON r.id=o."gameReleaseId" JOIN game g ON g.id=r."gameId" JOIN console_platform p ON p.id=r."platformId"
    UNION ALL
    SELECT e.*,a.name,concat_ws(' · ',v.name,v.edition,v.color),v."identificationStatus",
      ARRAY(SELECT "platformId" FROM accessory_variant_platform WHERE "accessoryVariantId"=v.id),
      ARRAY(SELECT "regionId" FROM accessory_variant_region WHERE "accessoryVariantId"=v.id),
      array_remove(ARRAY[COALESCE(v."producerId",a."producerId")],NULL),COALESCE(v."releaseYear",a."releaseYear")
    FROM eligible e JOIN owned_accessory o ON o."collectionItemId"=e.id JOIN accessory_variant v ON v.id=o."accessoryVariantId" JOIN accessory a ON a.id=v."accessoryId"
  )`;
}
function filtered(
  input: CollectionParameters,
  terms: ParsedTerm[],
  policy: Policy,
) {
  const conditions: Prisma.Sql[] = [];
  if (input.type) conditions.push(Prisma.sql`f.type::text=${input.type}`);
  for (const [key, column] of [
    ["platform", "platforms"],
    ["region", "regions"],
    ["company", "companies"],
  ] as const)
    if (input[key])
      conditions.push(
        Prisma.sql`${input[key]}::uuid=ANY(${Prisma.raw(`f.${column}`)})`,
      );
  if (input.year !== undefined)
    conditions.push(Prisma.sql`f."year"=${input.year}`);
  if (input.location)
    conditions.push(
      policy.showLocations
        ? Prisma.sql`f.location=${input.location}::uuid`
        : Prisma.sql`false`,
    );
  if (input.hasBox)
    conditions.push(
      input.hasBox === "unknown"
        ? Prisma.sql`f."hasBox" IS NULL`
        : Prisma.sql`f."hasBox"=${input.hasBox === "true"}`,
    );
  if (input.hasDefects !== undefined)
    conditions.push(
      policy.showDefects
        ? Prisma.sql`${input.hasDefects ? Prisma.empty : Prisma.sql`NOT`} EXISTS(SELECT FROM defect d WHERE d."collectionItemId"=f.id AND d.status IN ('ACTIVE','ACCEPTED'))`
        : Prisma.sql`false`,
    );
  const matching = terms.length
    ? Prisma.sql`, matching AS MATERIALIZED (${publicMatchesQuery(input.q, terms)})`
    : Prisma.empty;
  return Prisma.sql`${facts(policy)}${matching}, filtered AS MATERIALIZED (
    SELECT f.*,${terms.length ? Prisma.sql`m.whole,m.class,m.priority,m.strength` : Prisma.sql`false whole,0 class,0 priority,0 strength`}
    FROM facts f ${terms.length ? Prisma.sql`JOIN matching m ON m.id=f.id` : Prisma.empty}
    ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
  )`;
}
export function collectionPageQuery(
  input: CollectionParameters,
  terms: ParsedTerm[],
  policy: Policy,
) {
  const title = Prisma.sql`lower(normalize(title,NFC))`;
  const orders = {
    relevance: Prisma.sql`whole DESC,class,priority,strength DESC,${title}`,
    "name-asc": Prisma.sql`${title} ASC`,
    "name-desc": Prisma.sql`${title} DESC`,
    newest: Prisma.sql`"createdAt" DESC`,
    oldest: Prisma.sql`"createdAt" ASC`,
  };
  return Prisma.sql`${filtered(input, terms, policy)} SELECT id,type,title,context,"hasBox","identificationStatus"
    FROM filtered ORDER BY ${orders[input.sort]},id LIMIT ${input.limit + 1} OFFSET ${input.offset}`;
}
export async function collectionPage(
  input: CollectionParameters,
  terms: ParsedTerm[],
  policy: Policy,
  tx: TransactionClient,
) {
  return tx.$queryRaw<CardRow[]>(collectionPageQuery(input, terms, policy));
}
export function collectionCounts(
  input: CollectionParameters,
  terms: ParsedTerm[],
  policy: Policy,
  tx: TransactionClient,
) {
  return tx.$queryRaw<
    {
      total: bigint;
      consoles: bigint;
      games: bigint;
      accessories: bigint;
      boxed: bigint;
    }[]
  >(Prisma.sql`${filtered(input, terms, policy)}
    SELECT count(*) total,count(*) FILTER(WHERE type='CONSOLE') consoles,count(*) FILTER(WHERE type='GAME') games,
    count(*) FILTER(WHERE type='ACCESSORY') accessories,count(*) FILTER(WHERE "hasBox" IS TRUE) boxed FROM filtered`);
}
export function collectionFacets(
  input: CollectionParameters,
  terms: ParsedTerm[],
  policy: Policy,
  tx: TransactionClient,
) {
  return tx.$queryRaw<
    {
      field: "platform" | "region" | "company" | "year" | "location";
      value: string;
      label: string;
      count: bigint;
    }[]
  >(Prisma.sql`${filtered(input, terms, policy)}, options AS (
    SELECT 'platform' field,p.id::text value,p.name label,f.id FROM filtered f JOIN console_platform p ON p.id=ANY(f.platforms)
    UNION ALL SELECT 'region',r.id::text,r.name,f.id FROM filtered f JOIN region r ON r.id=ANY(f.regions)
    UNION ALL SELECT 'company',c.id::text,c.name,f.id FROM filtered f JOIN company c ON c.id=ANY(f.companies)
    UNION ALL SELECT 'year',"year"::text,"year"::text,id FROM filtered WHERE "year" IS NOT NULL
    ${policy.showLocations ? Prisma.sql`UNION ALL SELECT 'location',l.id::text,l.name,f.id FROM filtered f JOIN location l ON l.id=f.location` : Prisma.empty}
  ) SELECT field,value,label,count(DISTINCT id) count FROM options GROUP BY field,value,label ORDER BY field,lower(normalize(label,NFC)),value LIMIT 501`);
}
