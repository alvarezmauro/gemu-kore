import "server-only";
import { z } from "zod";
import { publicOrigin } from "@/server/config/public-origin";
import { publicRead, PublicCollectionError } from "./common";
import type { TransactionClient } from "@/server/db/transaction";
import type { Policy } from "@/server/repositories/public-collection/policy";
import * as repository from "@/server/repositories/public-collection/seo";
import * as media from "@/server/repositories/public-collection/media";
import { admittedItem, assetAdmission } from "./media";
import {
  publicSeoFallback,
  publicCategoryPaths,
  seoText,
  type PublicSeo,
} from "@/features/public-collection/seo";
import {
  publicCategories,
  parsePublicBrowse,
} from "@/features/public-collection/browsing";
import { siteIdentity } from "@/server/repositories/public-collection/policy";
const params = z.preprocess(
  // Record normalization drops this own key. Deny it before parsing so a
  // supplied query cannot become an empty, indexable parameter collection.
  (value) =>
    value && typeof value === "object" && Object.hasOwn(value, "__proto__")
      ? null
      : value,
  z.record(
    z.string(),
    z.union([z.string(), z.array(z.string()), z.undefined()]),
  ),
);
const input = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("home"), params: params.default({}) }),
  z.strictObject({
    kind: z.literal("category"),
    category: z.enum(["consoles", "games", "accessories", "search"]),
    params: params.default({}),
  }),
  z.strictObject({
    kind: z.literal("item"),
    type: z.enum(["CONSOLE", "GAME", "ACCESSORY"]),
    id: z.uuid(),
    params: params.default({}),
  }),
]);
export function indexingAllowed(policy: Policy | null) {
  return !!(
    policy?.publicCollectionEnabled && policy.allowSearchEngineIndexing
  );
}
export async function seoImage(itemId: string, tx: TransactionClient) {
  const item = await admittedItem(itemId, tx),
    admit = assetAdmission(tx);
  // Metadata deliberately excludes personal media, captions and alternative text.
  const uses = (await media.itemMediaUses(item, false, tx)).filter(
    (use) => use.image && use.kind === "catalog" && use.publicDisplayAssetId,
  );
  for (let start = 0; start < uses.length; start += 32) {
    const batch = uses.slice(start, start + 32);
    const assets = await Promise.all(
      batch.map((use) => admit(use.publicDisplayAssetId!, "IMAGE")),
    );
    for (const [index, use] of batch.entries()) {
      const a = assets[index];
      if (a?.scope === "CATALOG")
        return {
          path: `/api/media/public/seo/${itemId}/${use.id}`,
          width: a.width!,
          height: a.height!,
        };
    }
  }
  return null;
}
export function getPublicSeo(value: unknown): Promise<PublicSeo> {
  return publicRead(async (tx, policy) => {
    if (!policy?.publicCollectionEnabled) return { ...publicSeoFallback };
    const parsed = input.safeParse(value);
    if (!parsed.success) return { ...publicSeoFallback };
    const d = parsed.data,
      origin = publicOrigin(),
      site = await siteIdentity(tx),
      name = seoText(site?.collectionName ?? "GemuKore", 160) || "GemuKore";
    let title = name,
      description = seoText(
        site?.collectionDescription ?? publicSeoFallback.description,
        300,
      ),
      path = "/collection";
    let index =
      indexingAllowed(policy) && !!origin && !Object.keys(d.params).length;
    let image: PublicSeo["image"];
    if (d.kind === "category") {
      const p = parsePublicBrowse(d.params, d.category);
      if (
        !p ||
        (p.input.location && !policy.showLocations) ||
        (p.input.hasDefects !== undefined && !policy.showDefects)
      )
        return { ...publicSeoFallback };
      const category = publicCategories[d.category];
      title = `${category.title} | ${name}`;
      description = category.description;
      path += `/${d.category}`;
      index &&= d.category !== "search";
    } else if (d.kind === "item") {
      const row = await repository.seoIdentity(d.id, d.type, tx);
      if (!row) return { ...publicSeoFallback };
      let objectTitle: string, context: string, about: string | null;
      if (row.type === "CONSOLE" && row.ownedConsole) {
        const m = row.ownedConsole.consoleModel;
        objectTitle = m.platform.name;
        context = m.name;
        about = m.description ?? m.platform.description;
      } else if (row.type === "GAME" && row.ownedGame) {
        const r = row.ownedGame.gameRelease;
        objectTitle = r.game.name;
        context = [r.platform.name, r.editionName, r.printingLabel]
          .filter(Boolean)
          .join(" · ");
        about = r.descriptionOverride ?? r.game.description;
      } else if (row.type === "ACCESSORY" && row.ownedAccessory) {
        const v = row.ownedAccessory.accessoryVariant;
        objectTitle = v.accessory.name;
        context = [v.name, v.edition, v.color].filter(Boolean).join(" · ");
        about = v.descriptionOverride ?? v.accessory.description;
      } else return { ...publicSeoFallback };
      title = `${seoText(objectTitle, 200)} | ${name}`;
      description = seoText(
        about ??
          `${objectTitle} · ${context}. A physical copy from the collection.`,
        300,
      );
      path += `/${publicCategoryPaths[row.type]}/${row.id}`;
      if (index && origin) {
        const selected = await seoImage(row.id, tx);
        if (selected)
          image = {
            url: new URL(selected.path, origin).href,
            width: selected.width,
            height: selected.height,
            alt: seoText(`${objectTitle} · ${context}`, 300),
          };
      }
    }
    return {
      index,
      title,
      description,
      ...(origin ? { canonical: new URL(path, origin).href } : {}),
      ...(image ? { image } : {}),
    };
  });
}
export function getPublicCrawlPolicy() {
  return publicRead(async (_tx, policy) => ({
    index: indexingAllowed(policy) && !!publicOrigin(),
    origin: publicOrigin(),
  }));
}
export function getPublicSitemapIndex() {
  return publicRead(async (tx, policy) => {
    const origin = publicOrigin();
    if (!indexingAllowed(policy) || !origin) return [];
    const buckets = await repository.sitemapBuckets(tx);
    return [
      `${origin}/sitemap.xml?part=pages`,
      ...buckets.map(({ bucket }) => `${origin}/sitemap.xml?part=${bucket}`),
    ];
  });
}
export function getPublicSitemap(part: unknown) {
  return publicRead(async (tx, policy) => {
    const origin = publicOrigin();
    if (!indexingAllowed(policy) || !origin) return [];
    if (part === "pages")
      return [
        "/collection",
        "/collection/consoles",
        "/collection/games",
        "/collection/accessories",
      ].map((p) => new URL(p, origin).href);
    if (typeof part !== "string" || !/^[0-9a-f]{2}$/.test(part))
      throw new PublicCollectionError("NOT_FOUND");
    const rows = await repository.sitemapItems(part, tx);
    if (rows.length > repository.sitemapLimit)
      throw new PublicCollectionError("UNAVAILABLE");
    return rows.map(
      (r) => `${origin}/collection/${publicCategoryPaths[r.type]}/${r.id}`,
    );
  });
}
