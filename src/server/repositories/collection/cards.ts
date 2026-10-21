import "server-only";
import { Prisma } from "../../db/generated/client";
import type { TransactionClient } from "../../db/transaction";

export type CardSummary = {
  id: string;
  hasBox: boolean | null;
  unresolvedDefects: number;
  producer: string | null;
  photo: {
    assetId: string;
    altText: string | null;
    width: number;
    height: number;
  } | null;
};
// Shared private thumbnail projection. Its outer collection-item alias is c.
// Callers provide only their bounded, authorized page of owned-copy IDs.
export function cardPhotoQuery() {
  return Prisma.sql`(SELECT jsonb_build_object('assetId',COALESCE(t.id,s.id),'altText',m."altText",'width',COALESCE(t.width,s.width,1),'height',COALESCE(t.height,s.height,1))
      FROM collection_item_media m JOIN asset s ON s.id=m."assetId"
      LEFT JOIN LATERAL (
        SELECT thumb.id,thumb.width,thumb.height FROM asset_dependency input
        JOIN asset_dependency output ON output."sourceAssetId"=input."sourceAssetId"
        JOIN asset thumb ON thumb.id=output."derivedAssetId"
        WHERE input."derivedAssetId"=s.id AND input.purpose='RESIZE' AND output.purpose='RESIZE'
          AND thumb.state='READY' AND thumb.kind='IMAGE' AND thumb."deliveryClass"='DISPLAY'
          AND thumb."transformMetadata"->'data'->>'variant'='thumbnail'
        ORDER BY thumb.id LIMIT 1
      ) t ON true
      WHERE m."collectionItemId"=c.id AND m.type NOT IN ('CUSTOM_LOGO','CUSTOM_MODEL','SERIAL')
        AND s.state='READY' AND s.kind='IMAGE' AND s."deliveryClass"='DISPLAY'
      ORDER BY m."isPrimary" DESC,m."sortOrder",m.id LIMIT 1)`;
}
export function cardPhotosQuery(ids: string[]) {
  return Prisma.sql`SELECT c.id, ${cardPhotoQuery()} photo FROM collection_item c
    WHERE c.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
}
export function listCardPhotos(ids: string[], tx: TransactionClient) {
  if (!ids.length) return Promise.resolve([]);
  return tx.$queryRaw<Pick<CardSummary, "id" | "photo">[]>(
    cardPhotosQuery(ids),
  );
}
// Hydrate only the final page, in one batch on the service's authorized snapshot.
export async function listCardSummaries(ids: string[], tx: TransactionClient) {
  if (!ids.length) return [];
  return tx.$queryRaw<CardSummary[]>(Prisma.sql`
    SELECT c.id,c."hasBox",(SELECT count(*)::int FROM defect d WHERE d."collectionItemId"=c.id AND d.status IN ('ACTIVE','ACCEPTED')) "unresolvedDefects",
    (SELECT string_agg(p.name,', ' ORDER BY lower(normalize(p.name,NFC)),p.id) FROM company p
      WHERE p.id IN (v."producerId",a."producerId")) producer,
    ${cardPhotoQuery()} photo
    FROM collection_item c
    LEFT JOIN owned_accessory o ON o."collectionItemId"=c.id
    LEFT JOIN accessory_variant v ON v.id=o."accessoryVariantId"
    LEFT JOIN accessory a ON a.id=v."accessoryId"
    WHERE c.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
  `);
}
