import "server-only";
import { Prisma } from "../../db/generated/client";
import { canonicalSources, fragment } from "./expressions";
export type ParsedTerm = {
  ordinal: number;
  term: string;
  exact: string;
  prefix: string | null;
  lexemes: number;
  fuzzy: boolean;
};
export type SearchParameters = { q: string; limit: number; offset: number };
export type SearchRow = {
  id: string;
  type: "CONSOLE" | "GAME" | "ACCESSORY";
  title: string;
  context: string;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
  matchSources: (
    | "Identity"
    | "Platform"
    | "Company"
    | "Edition"
    | "Region"
    | "Identifier"
    | "Serial number"
    | "Note"
    | "Defect"
    | "Repair note"
  )[];
};
const vector = (sql: Prisma.Sql) =>
  Prisma.sql`to_tsvector('pg_catalog.simple'::regconfig, ${sql})`;
const escapePrefix = (value: string) => value.replace(/[\\%_]/g, "\\$&") + "%";
function canonicalMatches(terms: ParsedTerm[], q: string) {
  void terms;
  return Prisma.join(
    canonicalSources.map((definition) => {
      const v = vector(fragment(definition.vectorText));
      const fuzzy = Prisma.sql`lower(${fragment(definition.fuzzyText)})`;
      return Prisma.sql`SELECT ${definition.kind}::text AS kind, s.id AS target, t.ordinal,
      CASE WHEN ${v} @@ t.exact THEN 1 WHEN ${v} @@ t.prefix THEN 2 ELSE 3 END AS class,
      ${definition.priority}::int AS priority, ${definition.source}::text AS source,
      EXISTS(SELECT FROM unnest(${fragment(definition.whole)}) w WHERE lower(normalize(w, NFC))=lower(${q})) AS whole,
      CASE WHEN ${v} @@ t.exact THEN ts_rank_cd(${v},t.exact,32) WHEN ${v} @@ t.prefix THEN ts_rank_cd(${v},t.prefix,32) ELSE word_similarity(t.term,${fuzzy}) END AS strength
      FROM ${fragment(definition.table)} s CROSS JOIN terms t
      WHERE ${v} @@ t.exact OR ${v} @@ t.prefix OR (t.fuzzy AND t.term <% ${fuzzy})`;
    }),
    " UNION ALL ",
  );
}
function buildQuery(
  input: SearchParameters,
  parsed: ParsedTerm[],
  audience: "private" | "public",
) {
  const isPublic = audience === "public";
  const rootGate = isPublic
    ? Prisma.sql`AND c."publicationStatus"='PUBLISHED' AND EXISTS(SELECT FROM public_settings WHERE id=1 AND "publicCollectionEnabled")`
    : Prisma.empty;
  const noteGate = isPublic
    ? Prisma.sql`AND EXISTS(SELECT FROM public_settings WHERE id=1 AND "showNotes")`
    : Prisma.empty;
  const defectGate = isPublic
    ? Prisma.sql`AND EXISTS(SELECT FROM public_settings WHERE id=1 AND "showDefects")`
    : Prisma.empty;
  const notes = vector(Prisma.sql`normalize(COALESCE(c.notes,''),NFC)`);
  const defects = vector(
    Prisma.sql`normalize(COALESCE(d.title,'') || ' ' || COALESCE(d.description,''),NFC)`,
  );
  const repairs = vector(
    Prisma.sql`normalize(COALESCE(d."repairNote",''),NFC)`,
  );
  return Prisma.sql`WITH terms(ordinal,term,exact,prefix,fuzzy,pattern) AS (VALUES ${Prisma.join(parsed.map((t) => Prisma.sql`(${t.ordinal}::int,${t.term}::text,${t.exact}::tsquery,${t.prefix}::tsquery,${t.fuzzy}::boolean,${escapePrefix(t.term)}::text)`))}),
  roots AS NOT MATERIALIZED (SELECT c.id,c.type FROM collection_item c WHERE true ${rootGate}),
  links AS NOT MATERIALIZED (
    SELECT r.id,'model'::text kind,o."consoleModelId" target FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id
    UNION ALL SELECT r.id,'platform',m."platformId" FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id JOIN console_model m ON m.id=o."consoleModelId"
    UNION ALL SELECT r.id,'company',m."manufacturerId" FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id JOIN console_model m ON m.id=o."consoleModelId" WHERE m."manufacturerId" IS NOT NULL
    UNION ALL SELECT r.id,'company',p."manufacturerId" FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id JOIN console_model m ON m.id=o."consoleModelId" JOIN console_platform p ON p.id=m."platformId" WHERE p."manufacturerId" IS NOT NULL
    UNION ALL SELECT r.id,'region',mr."regionId" FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id JOIN console_model_region mr ON mr."consoleModelId"=o."consoleModelId"
    UNION ALL SELECT r.id,'release',o."gameReleaseId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id
    UNION ALL SELECT r.id,'game',g."gameId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release g ON g.id=o."gameReleaseId"
    UNION ALL SELECT r.id,'platform',g."platformId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release g ON g.id=o."gameReleaseId"
    UNION ALL SELECT r.id,'company',p."manufacturerId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release g ON g.id=o."gameReleaseId" JOIN console_platform p ON p.id=g."platformId" WHERE p."manufacturerId" IS NOT NULL
    UNION ALL SELECT r.id,'company',gc."companyId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release g ON g.id=o."gameReleaseId" JOIN game_company gc ON gc."gameId"=g."gameId"
    UNION ALL SELECT r.id,'company',gc."companyId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release_company gc ON gc."gameReleaseId"=o."gameReleaseId"
    UNION ALL SELECT r.id,'region',gr."regionId" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release_region gr ON gr."gameReleaseId"=o."gameReleaseId"
    UNION ALL SELECT r.id,'variant',o."accessoryVariantId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id
    UNION ALL SELECT r.id,'accessory',v."accessoryId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant v ON v.id=o."accessoryVariantId"
    UNION ALL SELECT r.id,'company',v."producerId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant v ON v.id=o."accessoryVariantId" WHERE v."producerId" IS NOT NULL
    UNION ALL SELECT r.id,'company',a."producerId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant v ON v.id=o."accessoryVariantId" JOIN accessory a ON a.id=v."accessoryId" WHERE a."producerId" IS NOT NULL
    UNION ALL SELECT r.id,'platform',vp."platformId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant_platform vp ON vp."accessoryVariantId"=o."accessoryVariantId"
    UNION ALL SELECT r.id,'region',vr."regionId" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant_region vr ON vr."accessoryVariantId"=o."accessoryVariantId"
  ), canonical AS NOT MATERIALIZED (${canonicalMatches(parsed, input.q)}),
  candidates AS (
    SELECT l.id,m.ordinal,m.class,m.priority,m.source,m.whole,m.strength FROM canonical m JOIN links l ON l.kind=m.kind AND l.target=m.target
    UNION ALL SELECT l.id,t.ordinal,CASE WHEN lower(normalize(i.value,NFC))=t.term THEN 0 ELSE 2 END,0,'Identifier',lower(normalize(i.value,NFC))=lower(${input.q}),0::real
      FROM product_identifier i JOIN links l ON (l.kind='model' AND l.target=i."consoleModelId") OR (l.kind='release' AND l.target=i."gameReleaseId") OR (l.kind='variant' AND l.target=i."accessoryVariantId") CROSS JOIN terms t
      WHERE lower(normalize(i.value,NFC)) LIKE t.pattern ESCAPE '\\'
    UNION ALL SELECT r.id,t.ordinal,1,2,'Note',false,ts_rank_cd(${notes},t.exact,32) FROM roots r JOIN collection_item c ON c.id=r.id CROSS JOIN terms t WHERE ${notes} @@ t.exact ${noteGate}
    UNION ALL SELECT r.id,t.ordinal,1,2,'Defect',false,ts_rank_cd(${defects},t.exact,32) FROM roots r JOIN defect d ON d."collectionItemId"=r.id CROSS JOIN terms t WHERE ${defects} @@ t.exact ${defectGate}
    ${
      isPublic
        ? Prisma.empty
        : Prisma.sql`UNION ALL SELECT r.id,t.ordinal,CASE WHEN lower(normalize(c."serialNumber",NFC))=t.term THEN 0 ELSE 2 END,0,'Serial number',lower(normalize(c."serialNumber",NFC))=lower(${input.q}),0::real FROM roots r JOIN collection_item c ON c.id=r.id CROSS JOIN terms t WHERE c."serialNumber" IS NOT NULL AND lower(normalize(c."serialNumber",NFC)) LIKE t.pattern ESCAPE '\\'
    UNION ALL SELECT r.id,t.ordinal,1,2,'Repair note',false,ts_rank_cd(${repairs},t.exact,32) FROM roots r JOIN defect d ON d."collectionItemId"=r.id CROSS JOIN terms t WHERE ${repairs} @@ t.exact`
    }
    UNION ALL SELECT r.id,t.ordinal,1,1,'Edition',false,0::real FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release g ON g.id=o."gameReleaseId" CROSS JOIN terms t WHERE replace(lower(g."editionType"::text),'_',' ') = t.term OR to_tsvector('pg_catalog.simple',replace(lower(g."editionType"::text),'_',' ')) @@ t.exact
  ), best AS (SELECT DISTINCT ON(id,ordinal) * FROM candidates ORDER BY id,ordinal,class,priority,strength DESC,source),
  matched AS (SELECT id,bool_or(whole) whole,max(class) class,sum(priority) priority,sum(strength) strength,array_agg(DISTINCT source ORDER BY source) sources FROM best GROUP BY id HAVING count(*)=${parsed.length}),
  identity AS NOT MATERIALIZED (
    SELECT r.id,r.type,p.name title,concat_ws(' · ',m.name,m."modelNumber") context,m."identificationStatus" status FROM roots r JOIN owned_console o ON o."collectionItemId"=r.id JOIN console_model m ON m.id=o."consoleModelId" JOIN console_platform p ON p.id=m."platformId"
    UNION ALL SELECT r.id,r.type,g.name,concat_ws(' · ',p.name,gr."editionName",gr."printingLabel"),gr."identificationStatus" FROM roots r JOIN owned_game o ON o."collectionItemId"=r.id JOIN game_release gr ON gr.id=o."gameReleaseId" JOIN game g ON g.id=gr."gameId" JOIN console_platform p ON p.id=gr."platformId"
    UNION ALL SELECT r.id,r.type,a.name,concat_ws(' · ',v.name,v.edition,v.color,v."modelNumber"),v."identificationStatus" FROM roots r JOIN owned_accessory o ON o."collectionItemId"=r.id JOIN accessory_variant v ON v.id=o."accessoryVariantId" JOIN accessory a ON a.id=v."accessoryId"
  )
  SELECT i.id,i.type,i.title,i.context,i.status AS "identificationStatus",m.sources AS "matchSources" FROM matched m JOIN identity i ON i.id=m.id
  ORDER BY m.whole DESC,m.class,m.priority,m.strength DESC,lower(normalize(i.title,NFC)),i.id LIMIT ${input.limit + 1} OFFSET ${input.offset}`;
}
export const privateSearchQuery = (
  input: SearchParameters,
  terms: ParsedTerm[],
) => buildQuery(input, terms, "private");
// Reserved query contract: no public route/service is exposed in Task 7.2.
// Tests execute it against real current policy, never a private result filter.
export const publicSearchQuery = (
  input: SearchParameters,
  terms: ParsedTerm[],
) => buildQuery(input, terms, "public");
