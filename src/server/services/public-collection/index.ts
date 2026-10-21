import "server-only";
import type {
  PublicCard,
  PublicCollection,
  PublicHome,
  PublicItemType,
} from "@/features/public-collection/contracts";
import {
  publicCollectionInput,
  publicDetailInput,
  type PublicCollectionInput,
} from "@/features/public-collection/validation";
import * as repository from "@/server/repositories/public-collection/query";
import {
  siteIdentity,
  type Policy,
} from "@/server/repositories/public-collection/policy";
import { findPublicDetail } from "@/server/repositories/public-collection/detail";
import {
  configureSearch,
  parseSearchTerms,
} from "@/server/repositories/search";
import type { TransactionClient } from "@/server/db/transaction";
import { publicRead, enabled, count, PublicCollectionError } from "./common";
import { detailProjection } from "./presentation";
export { PublicCollectionError } from "./common";

export function publicCard(row: repository.CardRow): PublicCard {
  const category = {
    CONSOLE: "consoles",
    GAME: "games",
    ACCESSORY: "accessories",
  }[row.type];
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    context: row.context,
    identificationStatus: row.identificationStatus,
    hasBox: row.hasBox,
    href: `/collection/${category}/${row.id}`,
    photo: null,
  };
}
async function collection(
  data: PublicCollectionInput,
  policy: Policy,
  tx: TransactionClient,
): Promise<PublicCollection> {
  if (
    (data.location && !policy.showLocations) ||
    (data.hasDefects !== undefined && !policy.showDefects)
  )
    throw new PublicCollectionError("INVALID_INPUT");
  await configureSearch(tx);
  const terms = data.q ? await parseSearchTerms(data.q, tx) : [];
  if (terms.reduce((n, term) => n + term.lexemes, 0) > 16)
    throw new PublicCollectionError("INVALID_INPUT");
  const rows = await repository.collectionPage(data, terms, policy, tx);
  const [totals] = await repository.collectionCounts(data, terms, policy, tx);
  const facets = await repository.collectionFacets(data, terms, policy, tx);
  if (!totals) throw new PublicCollectionError("UNAVAILABLE");
  return {
    items: rows.slice(0, data.limit).map(publicCard),
    counts: {
      total: count(totals.total),
      consoles: count(totals.consoles),
      games: count(totals.games),
      accessories: count(totals.accessories),
      boxed: count(totals.boxed),
    },
    facets: facets.slice(0, 500).map((f) => ({
      field: f.field,
      value: f.value,
      label: f.label,
      count: count(f.count),
    })),
    facetsTruncated: facets.length > 500,
    hasMore: rows.length > data.limit,
    offset: data.offset,
    limit: data.limit,
  };
}
export function getPublicCollection(
  input: unknown = {},
): Promise<PublicCollection> {
  return publicRead(async (tx, policy) => {
    enabled(policy);
    const parsed = publicCollectionInput.safeParse(input);
    if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
    return collection(parsed.data, policy, tx);
  });
}
export function getPublicHome(): Promise<PublicHome> {
  return publicRead(async (tx, policy) => {
    if (!policy?.publicCollectionEnabled)
      return {
        state: "private",
        message: "This collection is currently private.",
      };
    const data = await collection(
      publicCollectionInput.parse({ sort: "newest", limit: 8 }),
      policy,
      tx,
    );
    const site = await siteIdentity(tx);
    return {
      state: "public",
      name: site?.collectionName ?? "GemuKore",
      description: site?.collectionDescription ?? null,
      counts: data.counts,
      recent: data.items,
    };
  });
}
function detail(type: PublicItemType, input: unknown) {
  return publicRead(async (tx, policy) => {
    enabled(policy);
    const parsed = publicDetailInput.safeParse(input);
    if (!parsed.success) throw new PublicCollectionError("NOT_FOUND");
    const row = await findPublicDetail(parsed.data.id, type, policy, tx);
    if (!row) throw new PublicCollectionError("NOT_FOUND");
    return detailProjection(row, policy, tx);
  });
}
export const getPublicConsole = (input: unknown) => detail("CONSOLE", input);
export const getPublicGame = (input: unknown) => detail("GAME", input);
export const getPublicAccessory = (input: unknown) =>
  detail("ACCESSORY", input);
