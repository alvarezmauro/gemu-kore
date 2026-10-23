import "server-only";
import { Prisma } from "../../db/generated/client";

// Persistence input intentionally does not import browser feature modules.
export type ControlParameters = {
  type?: "console" | "game" | "accessory";
  platform?: string;
  manufacturer?: string;
  publisher?: string;
  producer?: string;
  model?: string;
  region?: string;
  year?: string;
  location?: string;
  hasBox?: "true" | "false" | "unknown";
  hasDefects?: "true" | "false";
  edition?: string;
  sort:
    | "relevance"
    | "name-asc"
    | "name-desc"
    | "newest"
    | "oldest"
    | "year-asc"
    | "year-desc"
    | "location"
    | "platform"
    | "publisher";
};
export function controlRows(input: ControlParameters, facts = false) {
  const publisherScope = input.region
    ? Prisma.sql`AND (rc."regionId" IS NULL OR EXISTS(SELECT FROM region x WHERE x.id=rc."regionId" AND x.slug=${input.region}))`
    : Prisma.empty;
  const year = input.region
    ? Prisma.sql`(SELECT min(rr."releaseYear") FROM game_release_region rr JOIN region x ON x.id=rr."regionId" WHERE rr."gameReleaseId"=g.id AND x.slug=${input.region})`
    : Prisma.sql`COALESCE((SELECT min(rr."releaseYear") FROM game_release_region rr WHERE rr."gameReleaseId"=g.id),g."firstReleaseYear")`;
  const conditions: Prisma.Sql[] = [];
  if (input.type)
    conditions.push(Prisma.sql`c.type::text=${input.type.toUpperCase()}`);
  for (const [key, column] of [
    ["platform", "platforms"],
    ["manufacturer", "manufacturers"],
    ["publisher", "publishers"],
    ["producer", "producers"],
    ["region", "regions"],
  ] as const)
    if (input[key])
      conditions.push(
        Prisma.sql`${input[key]}=ANY(${Prisma.raw(`f.${column}`)})`,
      );
  if (input.model) conditions.push(Prisma.sql`f.model=${input.model}`);
  if (input.edition) conditions.push(Prisma.sql`f.edition=${input.edition}`);
  if (input.year)
    conditions.push(
      input.year === "unknown"
        ? Prisma.sql`f.year IS NULL`
        : Prisma.sql`f.year=${Number(input.year)}`,
    );
  if (input.location)
    conditions.push(
      input.location === "unassigned"
        ? Prisma.sql`c."locationId" IS NULL`
        : Prisma.sql`${input.location}::uuid=ANY(lp.visited)`,
    );
  if (input.hasBox)
    conditions.push(
      input.hasBox === "unknown"
        ? Prisma.sql`c."hasBox" IS NULL`
        : Prisma.sql`c."hasBox"=${input.hasBox === "true"}`,
    );
  if (input.hasDefects)
    conditions.push(
      Prisma.sql`${input.hasDefects === "false" ? Prisma.sql`NOT` : Prisma.empty} EXISTS(SELECT FROM defect d WHERE d."collectionItemId"=c.id AND d.status IN ('ACTIVE','ACCEPTED'))`,
    );
  return Prisma.sql`WITH RECURSIVE location_paths AS (
    SELECT id,"parentId",name path,ARRAY[id] visited FROM location WHERE "parentId" IS NULL
    UNION ALL SELECT l.id,l."parentId",p.path || ' / ' || l.name,p.visited || l.id FROM location l JOIN location_paths p ON l."parentId"=p.id WHERE NOT l.id=ANY(p.visited)
  ), f AS MATERIALIZED (
    SELECT o."collectionItemId" id,ARRAY[p.slug] platforms,array_remove(ARRAY[c.slug],NULL) manufacturers,ARRAY[]::text[] publishers,ARRAY[]::text[] producers,m.slug model,
    ARRAY(SELECT x.slug FROM console_model_region r JOIN region x ON x.id=r."regionId" WHERE r."consoleModelId"=m.id) regions,
    m."releaseYear" AS "year",NULL::uuid AS "release",NULL::text edition,p.name "platformLabel",NULL::text "publisherLabel",p.name title
    FROM owned_console o JOIN console_model m ON m.id=o."consoleModelId" JOIN console_platform p ON p.id=m."platformId" LEFT JOIN company c ON c.id=m."manufacturerId"
    UNION ALL SELECT o."collectionItemId",ARRAY[p.slug],ARRAY[]::text[],
    ARRAY(SELECT c.slug FROM game_release_company rc JOIN company c ON c.id=rc."companyId" WHERE rc."gameReleaseId"=g.id AND rc.role='PUBLISHER' ${publisherScope}),ARRAY[]::text[],NULL,
    ARRAY(SELECT x.slug FROM game_release_region r JOIN region x ON x.id=r."regionId" WHERE r."gameReleaseId"=g.id),${year},g.id,g."editionType"::text,p.name,
    (SELECT string_agg(t.name,', ' ORDER BY lower(normalize(t.name,NFC)),t.id) FROM (SELECT DISTINCT c.id,c.name FROM game_release_company rc JOIN company c ON c.id=rc."companyId" WHERE rc."gameReleaseId"=g.id AND rc.role='PUBLISHER' ${publisherScope})t),gg.name
    FROM owned_game o JOIN game_release g ON g.id=o."gameReleaseId" JOIN game gg ON gg.id=g."gameId" JOIN console_platform p ON p.id=g."platformId"
    UNION ALL SELECT o."collectionItemId",
    ARRAY(SELECT p.slug FROM accessory_variant_platform ap JOIN console_platform p ON p.id=ap."platformId" WHERE ap."accessoryVariantId"=v.id),ARRAY[]::text[],ARRAY[]::text[],array_remove(ARRAY[pc.slug,vc.slug],NULL),NULL,
    ARRAY(SELECT x.slug FROM accessory_variant_region r JOIN region x ON x.id=r."regionId" WHERE r."accessoryVariantId"=v.id),v."releaseYear",NULL,NULL,
    (SELECT string_agg(p.name,', ' ORDER BY lower(normalize(p.name,NFC)),p.id) FROM accessory_variant_platform ap JOIN console_platform p ON p.id=ap."platformId" WHERE ap."accessoryVariantId"=v.id),NULL,a.name
    FROM owned_accessory o JOIN accessory_variant v ON v.id=o."accessoryVariantId" JOIN accessory a ON a.id=v."accessoryId" LEFT JOIN company pc ON pc.id=a."producerId" LEFT JOIN company vc ON vc.id=v."producerId"
  ) SELECT ${facts ? Prisma.sql`f.*` : Prisma.sql`f.id,f.title,f.year,f."platformLabel",f."publisherLabel"`},c.type,c."createdAt",lp.path "locationLabel",lp.visited "locationIds"
  FROM f JOIN collection_item c ON c.id=f.id LEFT JOIN location_paths lp ON lp.id=c."locationId"
  ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}`;
}
export function controlOrder(sort: ControlParameters["sort"]) {
  const title = Prisma.sql`lower(normalize(i.title,NFC))`;
  // Only these fixed expressions can enter ORDER BY. Always retain a UUID tie.
  const keys = {
    relevance: Prisma.sql`m.whole DESC,m.class,m.priority,m.strength DESC,${title}`,
    "name-asc": Prisma.sql`${title} ASC`,
    "name-desc": Prisma.sql`${title} DESC`,
    newest: Prisma.sql`i."createdAt" DESC`,
    oldest: Prisma.sql`i."createdAt" ASC`,
    "year-asc": Prisma.sql`i.year ASC NULLS LAST,${title}`,
    "year-desc": Prisma.sql`i.year DESC NULLS LAST,${title}`,
    location: Prisma.sql`lower(normalize(i."locationLabel",NFC)) ASC NULLS LAST,${title}`,
    platform: Prisma.sql`lower(normalize(i."platformLabel",NFC)) ASC NULLS LAST,${title}`,
    publisher: Prisma.sql`lower(normalize(i."publisherLabel",NFC)) ASC NULLS LAST,${title}`,
  };
  return Prisma.sql`${keys[sort]},i.id`;
}
export type OptionRow = {
  field:
    | "platform"
    | "manufacturer"
    | "publisher"
    | "producer"
    | "model"
    | "region"
    | "year"
    | "location";
  value: string;
  label: string;
};
export function optionsQuery() {
  return Prisma.sql`WITH rows AS MATERIALIZED (${controlRows({ sort: "relevance" }, true)}), options AS (
    SELECT 'platform' field,p.slug value,p.name label FROM console_platform p JOIN rows r ON p.slug=ANY(r.platforms)
    UNION ALL SELECT 'manufacturer',c.slug,c.name FROM company c JOIN rows r ON c.slug=ANY(r.manufacturers)
    UNION ALL SELECT 'publisher',c.slug,c.name FROM company c JOIN rows r ON c.slug=ANY(r.publishers)
    UNION ALL SELECT 'producer',c.slug,c.name FROM company c JOIN rows r ON c.slug=ANY(r.producers)
    UNION ALL SELECT 'model',m.slug,p.name || ' · ' || m.name FROM console_model m JOIN console_platform p ON p.id=m."platformId" JOIN rows r ON r.model=m.slug
    UNION ALL SELECT 'region',x.slug,x.name FROM region x JOIN rows r ON x.slug=ANY(r.regions)
    UNION ALL SELECT 'year',r.year::text,r.year::text FROM rows r WHERE r.year IS NOT NULL
    UNION ALL SELECT 'year',rr."releaseYear"::text,rr."releaseYear"::text FROM game_release_region rr JOIN rows r ON r.release=rr."gameReleaseId" WHERE rr."releaseYear" IS NOT NULL
    UNION ALL SELECT 'location',l.id::text,(SELECT string_agg(a.name,' / ' ORDER BY x.ordinality) FROM unnest(r."locationIds") WITH ORDINALITY x(id,ordinality) JOIN location a ON a.id=x.id WHERE x.ordinality<=array_position(r."locationIds",l.id)) FROM location l JOIN rows r ON l.id=ANY(r."locationIds")
  ) SELECT DISTINCT field,value,label FROM options ORDER BY field,label,value`;
}
