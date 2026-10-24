import "server-only";
import { z } from "zod";
import type { TransactionClient } from "@/server/db/transaction";
import type { Policy } from "@/server/repositories/public-collection/policy";
import * as repository from "@/server/repositories/public-collection/media";
import { enabled, publicRead, PublicCollectionError } from "./common";
import type { PublicImage } from "@/features/public-collection/contracts";
export type PublicAsset = Awaited<
  ReturnType<typeof repository.assetNodes>
>[number];
// Fixed lineage is immutable once ready. Still check current rights at EVERY
// request; source originals need rights, not a public content approval.
export function assetAdmission(tx: TransactionClient) {
  const memo = new Map<string, Promise<PublicAsset | null>>();
  let pending = new Map<
    string,
    {
      resolve: (asset: PublicAsset | null) => void;
      reject: (error: unknown) => void;
    }
  >();
  let flushing = false;
  // Coalesce independent admissions at each traversal step. Keep the loader
  // inside this transaction: a later request must observe revoked rights.
  async function flush() {
    flushing = true;
    while (pending.size) {
      const batch = pending;
      pending = new Map();
      const ids = [...batch.keys()];
      try {
        for (let start = 0; start < ids.length; start += 128) {
          const chunk = ids.slice(start, start + 128);
          const rows = new Map(
            (await repository.assetNodes(chunk, tx)).map((a) => [a.id, a]),
          );
          for (const id of chunk) batch.get(id)!.resolve(rows.get(id) ?? null);
        }
      } catch (error) {
        for (const entry of batch.values()) entry.reject(error);
      }
    }
    flushing = false;
  }
  const node = (id: string) => {
    if (!memo.has(id)) {
      const schedule = pending.size === 0 && !flushing;
      memo.set(
        id,
        new Promise((resolve, reject) => pending.set(id, { resolve, reject })),
      );
      if (schedule) void Promise.resolve().then(flush);
    }
    return memo.get(id)!;
  };
  return async (id: string, kind: "IMAGE" | "MODEL_3D") => {
    const asset = await node(id);
    if (
      !asset ||
      asset.state !== "READY" ||
      asset.deliveryClass !== "DISPLAY" ||
      asset.kind !== kind ||
      !asset.publicSafe ||
      !asset.reviewedAt ||
      asset.rightsStatus !== "APPROVED" ||
      !asset.sizeBytes ||
      asset.sizeBytes >
        BigInt(kind === "IMAGE" ? 20 * 1024 * 1024 : 8 * 1024 * 1024) ||
      !(kind === "IMAGE"
        ? ["image/png", "image/jpeg", "image/webp"].includes(
            asset.mimeType ?? "",
          )
        : asset.mimeType === "model/gltf-binary")
    )
      return null;
    if (
      kind === "IMAGE" &&
      (!asset.width ||
        !asset.height ||
        asset.width > 12000 ||
        asset.height > 12000)
    )
      return null;
    const heights = new Map<string, number>(),
      path = new Set<string>(),
      discovered = new Set([id]);
    async function visit(id: string, depth: number): Promise<boolean> {
      if (path.has(id) || depth > 16) return false;
      const knownHeight = heights.get(id);
      if (knownHeight !== undefined) return depth + knownHeight <= 16;
      const current = await node(id);
      if (
        !current ||
        current.state !== "READY" ||
        current.rightsStatus !== "APPROVED" ||
        current.inputs.length > 128
      )
        return false;
      path.add(id);
      // Fetch siblings together; validate them in DFS order so cycle/path and
      // unique-node accounting keep their existing fail-closed semantics.
      if (depth < 16) {
        for (const edge of current.inputs) {
          discovered.add(edge.sourceAssetId);
          if (discovered.size > 128) return false;
        }
        await Promise.all(
          current.inputs.map((edge) => node(edge.sourceAssetId)),
        );
      }
      let height = 0;
      for (const edge of current.inputs) {
        if (
          !["RESIZE", "SANITIZE", "RENDER_INPUT"].includes(edge.purpose) ||
          !(await visit(edge.sourceAssetId, depth + 1))
        )
          return false;
        height = Math.max(height, heights.get(edge.sourceAssetId)! + 1);
      }
      path.delete(id);
      heights.set(id, height);
      return true;
    }
    return (await visit(id, 0)) ? asset : null;
  };
}
export async function admittedItem(id: string, tx: TransactionClient) {
  const item = await repository.mediaIdentity(id, tx);
  if (!item || item.publicationStatus !== "PUBLISHED")
    throw new PublicCollectionError("NOT_FOUND");
  return item;
}
export async function publicItemMedia(
  id: string,
  policy: Policy,
  tx: TransactionClient,
) {
  const item = await admittedItem(id, tx),
    admit = assetAdmission(tx);
  const uses = await repository.itemMediaUses(
    item,
    policy.showPersonalPhotos,
    tx,
  );
  const images: PublicImage[] = [];
  let model: {
    useId: string;
    kind: "personal" | "catalog";
    source: string;
  } | null = null;
  for (let start = 0; start < uses.length; start += 32) {
    const batch = uses
      .slice(start, start + 32)
      .filter(
        (use) =>
          use.publicDisplayAssetId &&
          (use.model ? !model : use.image && images.length < 25),
      );
    const assets = await Promise.all(
      batch.map((use) =>
        admit(use.publicDisplayAssetId!, use.model ? "MODEL_3D" : "IMAGE"),
      ),
    );
    for (const [index, use] of batch.entries()) {
      const asset = assets[index];
      if (
        !asset ||
        asset.scope !== (use.kind === "personal" ? "COLLECTION" : "CATALOG")
      )
        continue;
      if (use.model) {
        model ??= {
          useId: use.id,
          kind: use.kind,
          source:
            use.kind === "personal" ? "Collection model" : "Catalog model",
        };
      } else if (use.image && images.length < 25)
        images.push({
          url: `/api/media/public/items/${id}/${use.kind}/${use.id}`,
          alt: use.altText ?? "Collection object",
          caption: use.caption,
          width: asset.width!,
          height: asset.height!,
          source: use.source,
        });
    }
    if (images.length === 25 && model) break;
  }
  return { images: images.slice(0, 24), hasMore: images.length > 24, model };
}
export const publicMediaInput = z.discriminatedUnion("context", [
  z.strictObject({
    context: z.literal("seo"),
    itemId: z.uuid(),
    useId: z.uuid(),
  }),
  z.strictObject({
    context: z.literal("item"),
    itemId: z.uuid(),
    kind: z.enum(["personal", "catalog"]),
    useId: z.uuid(),
  }),
  z.strictObject({ context: z.literal("site"), useId: z.uuid() }),
  z.strictObject({
    context: z.literal("component"),
    itemId: z.uuid(),
    componentId: z.uuid(),
    slotKey: z.string().regex(/^(geometry|[A-Z][A-Z0-9_]{0,63})$/),
  }),
]);
export type MediaInput = z.infer<typeof publicMediaInput>;
export async function resolveItemUse(
  input: Extract<MediaInput, { context: "item" }>,
  policy: Policy,
  tx: TransactionClient,
) {
  const item = await admittedItem(input.itemId, tx);
  const uses = await repository.itemMediaUses(
    item,
    policy.showPersonalPhotos,
    tx,
  );
  const use = uses.find((u) => u.id === input.useId && u.kind === input.kind);
  if (!use?.publicApproved || !use.approvedAt || !use.publicDisplayAssetId)
    throw new PublicCollectionError("NOT_FOUND");
  const asset = await assetAdmission(tx)(
    use.publicDisplayAssetId,
    use.model ? "MODEL_3D" : "IMAGE",
  );
  if (
    !asset ||
    asset.scope !== (input.kind === "personal" ? "COLLECTION" : "CATALOG")
  )
    throw new PublicCollectionError("NOT_FOUND");
  return asset;
}
export async function mediaDelivery(input: unknown) {
  return publicRead(async (tx, policy) => {
    enabled(policy);
    const p = publicMediaInput.safeParse(input);
    if (!p.success) throw new PublicCollectionError("NOT_FOUND");
    let asset: PublicAsset | null;
    if (p.data.context === "seo") {
      if (!policy.allowSearchEngineIndexing)
        throw new PublicCollectionError("NOT_FOUND");
      const { publicOrigin } = await import("@/server/config/public-origin");
      if (!publicOrigin()) throw new PublicCollectionError("NOT_FOUND");
      asset = await resolveItemUse(
        {
          context: "item",
          kind: "catalog",
          itemId: p.data.itemId,
          useId: p.data.useId,
        },
        policy,
        tx,
      );
      if (asset.kind !== "IMAGE") throw new PublicCollectionError("NOT_FOUND");
    } else if (p.data.context === "item")
      asset = await resolveItemUse(p.data, policy, tx);
    else if (p.data.context === "site") {
      const use = await tx.appAsset.findFirst({
        where: {
          id: p.data.useId,
          role: "COLLECTION_LOGO",
          appSettingsId: 1,
          publicApproved: true,
          approvedAt: { not: null },
        },
        select: { publicDisplayAssetId: true },
      });
      asset = use?.publicDisplayAssetId
        ? await assetAdmission(tx)(use.publicDisplayAssetId, "IMAGE")
        : null;
      if (asset?.scope !== "COLLECTION") asset = null;
    } else {
      const { resolveComponentAsset } = await import("./components");
      asset = await resolveComponentAsset(p.data, tx);
    }
    if (!asset) throw new PublicCollectionError("NOT_FOUND");
    const locator = await repository.assetLocator(asset.id, tx);
    if (!locator) throw new PublicCollectionError("NOT_FOUND");
    return {
      locator,
      indexable: p.data.context === "seo",
      mimeType: asset.mimeType!,
      sizeBytes: Number(asset.sizeBytes),
    };
  });
}
