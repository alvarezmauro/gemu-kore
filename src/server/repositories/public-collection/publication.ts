import "server-only";
import { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import type { Policy } from "./policy";
type Settings = Omit<Policy, "revision">;
function affected(before: Policy, after: Settings) {
  const clauses: Prisma.Sql[] = [];
  if (!before.showSerialNumbers && after.showSerialNumbers)
    clauses.push(Prisma.sql`"serialNumber" IS NOT NULL`);
  if (!before.showNotes && after.showNotes)
    clauses.push(Prisma.sql`notes IS NOT NULL`);
  if (!before.showLocations && after.showLocations)
    clauses.push(Prisma.sql`"locationId" IS NOT NULL`);
  if (!before.showDefects && after.showDefects)
    clauses.push(
      Prisma.sql`EXISTS(SELECT FROM defect WHERE "collectionItemId"=c.id)`,
    );
  if (!before.showPersonalPhotos && after.showPersonalPhotos)
    clauses.push(
      Prisma.sql`EXISTS(SELECT FROM collection_item_media WHERE "collectionItemId"=c.id AND "publicApproved" AND type<>'SERIAL')`,
    );
  return Prisma.sql`c."publicationStatus"='PUBLISHED' AND (${clauses.length ? Prisma.join(clauses, " OR ") : Prisma.sql`false`})`;
}
export async function impactCount(
  before: Policy,
  after: Settings,
  tx: TransactionClient,
) {
  const [row] = await tx.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT count(*) FROM collection_item c WHERE ${affected(before, after)}`,
  );
  return row.count;
}
export function invalidateExpandedCopies(
  before: Policy,
  after: Settings,
  actorId: string,
  tx: TransactionClient,
) {
  return tx.$executeRaw(Prisma.sql`WITH targets AS MATERIALIZED (
    SELECT c.id FROM collection_item c WHERE ${affected(before, after)} ORDER BY c.id FOR UPDATE
  ) UPDATE collection_item SET "publicationStatus"='PRIVATE',"publishedAt"=NULL,"publishedById"=NULL,
      revision=revision+1,"updatedById"=${actorId}::uuid,"updatedAt"=now()
    WHERE id IN (SELECT id FROM targets)`);
}
export function saveSettings(settings: Settings, tx: TransactionClient) {
  return tx.publicSettings.update({
    where: { id: 1 },
    data: { ...settings, revision: { increment: 1 } },
    select: { revision: true },
  });
}
export function itemState(id: string, tx: TransactionClient) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: { id: true, revision: true, publicationStatus: true },
  });
}
export async function lockItem(id: string, tx: TransactionClient) {
  await tx.$queryRaw`SELECT id FROM collection_item WHERE id=${id}::uuid FOR UPDATE`;
}
export function saveItem(
  id: string,
  published: boolean,
  actorId: string,
  tx: TransactionClient,
) {
  return tx.collectionItem.update({
    where: { id },
    data: {
      publicationStatus: published ? "PUBLISHED" : "PRIVATE",
      publishedAt: published ? new Date() : null,
      publishedById: published ? actorId : null,
      revision: { increment: 1 },
      updatedById: actorId,
    },
    select: { revision: true },
  });
}
// A freshness digest, not an authorization credential. Conservatively include
// all canonical revisions so edits to shared companies/regions cannot slip
// between preview and approval. Only aggregate tokens cross the DB boundary.
export async function reviewToken(intent: object, tx: TransactionClient) {
  const [row] = await tx.$queryRaw<
    { token: string }[]
  >(Prisma.sql`WITH versions AS (
    SELECT 'item:'||id::text identity,revision::text version FROM collection_item
    UNION ALL SELECT 'company:'||id::text,revision::text FROM company
    UNION ALL SELECT 'region:'||id::text,revision::text FROM region
    UNION ALL SELECT 'platform:'||id::text,revision::text FROM console_platform
    UNION ALL SELECT 'model:'||id::text,revision::text FROM console_model
    UNION ALL SELECT 'game:'||id::text,revision::text FROM game
    UNION ALL SELECT 'release:'||id::text,revision::text FROM game_release
    UNION ALL SELECT 'accessory:'||id::text,revision::text FROM accessory
    UNION ALL SELECT 'variant:'||id::text,revision::text FROM accessory_variant
    UNION ALL SELECT 'location:'||id::text,"updatedAt"::text FROM location
    UNION ALL SELECT 'site:'||id::text,revision::text FROM app_settings
    UNION ALL SELECT 'policy:'||id::text,revision::text FROM public_settings
  ) SELECT md5(${JSON.stringify(intent)}||COALESCE(string_agg(identity||':'||version,',' ORDER BY identity),'')) token FROM versions`);
  return row.token;
}
export async function invalidateLocationCopies(
  locationId: string,
  actorId: string,
  tx: TransactionClient,
) {
  // Hierarchy writes already hold their existing advisory lock. Bound/cycle
  // avoidance uses an ID set; this invalidates before the ancestor is changed.
  return tx.$executeRaw`WITH RECURSIVE subtree AS (
    SELECT id FROM location WHERE id=${locationId}::uuid
    UNION SELECT l.id FROM location l JOIN subtree p ON l."parentId"=p.id
  ), targets AS MATERIALIZED (
    SELECT c.id FROM collection_item c WHERE c."publicationStatus"='PUBLISHED'
      AND c."locationId" IN (SELECT id FROM subtree)
      AND EXISTS(SELECT FROM public_settings WHERE id=1 AND "showLocations") ORDER BY c.id FOR UPDATE
  ) UPDATE collection_item SET "publicationStatus"='PRIVATE',"publishedAt"=NULL,"publishedById"=NULL,
      revision=revision+1,"updatedById"=${actorId}::uuid,"updatedAt"=now()
    WHERE id IN (SELECT id FROM targets)`;
}
