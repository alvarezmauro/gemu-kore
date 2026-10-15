import "server-only";
import { Prisma } from "../../db/generated/client";
import { canonicalMatches, termValues, type ParsedTerm } from "./query";

// Canonical target IDs never stand in for CollectionItem IDs. This private
// palette lookup searches each record's own indexed identity fields only.
export type CatalogSearchRow = {
  id: string;
  kind:
    | "company"
    | "platform"
    | "model"
    | "game"
    | "release"
    | "accessory"
    | "variant"
    | "region";
  title: string;
  context: string;
  identificationStatus: "INCOMPLETE" | "CONFIRMED" | null;
};
export function privateCatalogSearchQuery(q: string, terms: ParsedTerm[]) {
  return Prisma.sql`WITH terms(ordinal,term,exact,prefix,fuzzy,pattern) AS (VALUES ${termValues(terms)}),
  candidates AS MATERIALIZED (${canonicalMatches(q, true)}),
  matched AS (
    SELECT kind,target,bool_or(whole) whole,max(class) class,sum(strength) strength
    FROM candidates GROUP BY kind,target HAVING count(DISTINCT ordinal)=${terms.length}
  ), identities AS MATERIALIZED (
    SELECT id,'company'::text kind,name title,''::text context,NULL::text status FROM company WHERE "archivedAt" IS NULL
    UNION ALL SELECT id,'region',name,code,NULL FROM region WHERE "archivedAt" IS NULL
    UNION ALL SELECT p.id,'platform',p.name,COALESCE(c.name,''),NULL FROM console_platform p LEFT JOIN company c ON c.id=p."manufacturerId" WHERE p."archivedAt" IS NULL
    UNION ALL SELECT m.id,'model',m.name,concat_ws(' · ',p.name,m."modelNumber"),m."identificationStatus"::text FROM console_model m JOIN console_platform p ON p.id=m."platformId" WHERE m."archivedAt" IS NULL AND p."archivedAt" IS NULL
    UNION ALL SELECT id,'game',name,'',NULL FROM game WHERE "archivedAt" IS NULL
    UNION ALL SELECT r.id,'release',g.name,concat_ws(' · ',p.name,r."editionName",r."printingLabel"),r."identificationStatus"::text FROM game_release r JOIN game g ON g.id=r."gameId" JOIN console_platform p ON p.id=r."platformId" WHERE r."archivedAt" IS NULL AND g."archivedAt" IS NULL AND p."archivedAt" IS NULL
    UNION ALL SELECT a.id,'accessory',a.name,COALESCE(c.name,''),NULL FROM accessory a LEFT JOIN company c ON c.id=a."producerId" WHERE a."archivedAt" IS NULL
    UNION ALL SELECT v.id,'variant',v.name,concat_ws(' · ',a.name,v.edition,v.color,v."modelNumber"),v."identificationStatus"::text FROM accessory_variant v JOIN accessory a ON a.id=v."accessoryId" WHERE v."archivedAt" IS NULL AND a."archivedAt" IS NULL
  )
  SELECT i.id,i.kind,i.title,i.context,i.status AS "identificationStatus" FROM matched m JOIN identities i ON i.kind=m.kind AND i.id=m.target
  ORDER BY m.whole DESC,m.class,m.strength DESC,lower(normalize(i.title,NFC)),i.kind,i.id LIMIT 11`;
}
