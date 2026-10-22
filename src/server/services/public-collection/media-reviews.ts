import "server-only";
import { createHash } from "node:crypto";
import { requirePermission, PermissionError } from "@/server/auth/permissions";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import { PublicCollectionError } from "./common";
import {
  mediaReviewInput,
  mediaReviewSave,
  componentReviewInput,
  componentReviewSave,
} from "@/features/public-collection/media-review-validation";
import * as repository from "@/server/repositories/public-collection/media";

import { componentPresentation } from "./components";
import { reviewToken } from "@/server/repositories/public-collection/publication";
const digest = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_k, v) => (typeof v === "bigint" ? String(v) : v)),
    )
    .digest("hex");
async function guarded<T>(
  context: PrivateAccessContext,
  work: (tx: TransactionClient, actor: PrivateAccessContext) => Promise<T>,
) {
  try {
    return await withTransaction(
      async (tx) =>
        work(tx, await requirePermission(context, "publication.manage", tx)),
      { publicationPolicy: "exclusive" },
    );
  } catch (e) {
    if (
      e instanceof PublicCollectionError ||
      e instanceof PermissionError ||
      e instanceof PrivateAccessError
    )
      throw e;
    throw new PublicCollectionError("UNAVAILABLE");
  }
}
async function useSnapshot(input: unknown, tx: TransactionClient) {
  const p = mediaReviewInput.safeParse(input);
  if (!p.success) throw new PublicCollectionError("INVALID_INPUT");
  const d = p.data;
  const use =
    d.kind === "personal"
      ? await tx.collectionItemMedia.findUnique({
          where: { id: d.useId },
          select: {
            id: true,
            assetId: true,
            type: true,
            collectionItemId: true,
            publicApproved: true,
            publicDisplayAssetId: true,
            updatedAt: true,
            caption: true,
            altText: true,
          },
        })
      : d.kind === "catalog"
        ? await tx.catalogAsset.findUnique({
            where: { id: d.useId },
            select: {
              id: true,
              assetId: true,
              role: true,
              publicApproved: true,
              publicDisplayAssetId: true,
              updatedAt: true,
              caption: true,
              altText: true,
            },
          })
        : await tx.appAsset.findUnique({
            where: { id: d.useId },
            select: {
              id: true,
              assetId: true,
              role: true,
              publicApproved: true,
              publicDisplayAssetId: true,
              updatedAt: true,
            },
          });
  if (!use || ("type" in use && use.type === "SERIAL"))
    throw new PublicCollectionError("NOT_FOUND");
  const model =
    ("type" in use && use.type === "CUSTOM_MODEL") ||
    ("role" in use && use.role === "MODEL_3D");
  const output = await repository.assetNode(d.displayAssetId, tx);
  if (
    !output ||
    output.state !== "READY" ||
    output.deliveryClass !== "DISPLAY" ||
    output.scope !== (d.kind === "catalog" ? "CATALOG" : "COLLECTION") ||
    output.kind !== (model ? "MODEL_3D" : "IMAGE") ||
    !(model
      ? output.mimeType === "model/gltf-binary"
      : ["image/png", "image/jpeg", "image/webp"].includes(
          output.mimeType ?? "",
        ))
  )
    throw new PublicCollectionError("INVALID_INPUT");
  const nodes: NonNullable<Awaited<ReturnType<typeof repository.assetNode>>>[] =
    [];
  const visited = new Set<string>(),
    path = new Set<string>();
  async function visit(id: string, depth: number) {
    if (path.has(id) || depth > 16 || visited.size >= 128)
      throw new PublicCollectionError("INVALID_INPUT");
    if (visited.has(id)) return;
    const a = await repository.assetNode(id, tx);
    if (!a || a.state !== "READY" || a.inputs.length > 128)
      throw new PublicCollectionError("INVALID_INPUT");
    nodes.push(a);
    visited.add(id);
    path.add(id);
    for (const edge of a.inputs) await visit(edge.sourceAssetId, depth + 1);
    path.delete(id);
  }
  await visit(output.id, 0);
  // The display must actually derive from the use's source; no unrelated pin.
  if (!visited.has(use.assetId))
    throw new PublicCollectionError("INVALID_INPUT");
  return {
    d,
    use,
    output,
    nodes,
    reviewToken: digest({ d, use, nodes, versions: await reviewToken(d, tx) }),
  };
}
export function reviewMediaUse(context: PrivateAccessContext, input: unknown) {
  return guarded(context, async (tx) => {
    const s = await useSnapshot(input, tx);
    return {
      reviewToken: s.reviewToken,
      url: `/api/media/private/${s.output.id}`,
      kind: s.output.kind,
      caption: "caption" in s.use ? s.use.caption : null,
      altText: "altText" in s.use ? s.use.altText : null,
      inputs: s.nodes.length,
      approved: s.d.approved,
    };
  });
}
export function saveMediaUse(context: PrivateAccessContext, input: unknown) {
  return guarded(context, async (tx, actor) => {
    const p = mediaReviewSave.safeParse(input);
    if (!p.success) throw new PublicCollectionError("INVALID_INPUT");
    const { reviewToken: expected, reviewed: _, ...intent } = p.data;
    void _;
    const s = await useSnapshot(intent, tx);
    if (s.reviewToken !== expected) throw new PublicCollectionError("STALE");
    if (
      s.use.publicApproved === intent.approved &&
      (!intent.approved ||
        (s.use.publicDisplayAssetId === s.output.id &&
          s.output.publicSafe &&
          s.output.reviewedAt &&
          s.nodes.every((a) => a.rightsStatus === "APPROVED")))
    )
      return { approved: intent.approved };
    if (intent.approved) {
      // The explicit review attests source rights AND the exact sanitized output.
      // It never marks an original source publicSafe.
      for (const a of [...s.nodes].sort((a, b) => a.id.localeCompare(b.id)))
        await tx.asset.update({
          where: { id: a.id },
          data: {
            rightsStatus: "APPROVED",
            ...(a.id === s.output.id
              ? {
                  publicSafe: true,
                  reviewedAt: new Date(),
                  reviewedById: actor.userId,
                }
              : {}),
          },
        });
    }
    const data = {
      publicDisplayAssetId: intent.approved ? s.output.id : null,
      publicApproved: false,
      approvedAt: null,
      approvedById: null,
    };
    const approve = {
      publicApproved: intent.approved,
      approvedAt: intent.approved ? new Date() : null,
      approvedById: intent.approved ? actor.userId : null,
    };
    // Pointer changes clear approval at the DB boundary. Record a separate,
    // deliberate approval only after that reset has completed.
    if (intent.kind === "personal") {
      await tx.collectionItemMedia.update({
        where: { id: intent.useId },
        data,
      });
      await tx.collectionItemMedia.update({
        where: { id: intent.useId },
        data: approve,
      });
      if ("collectionItemId" in s.use)
        await tx.collectionItem.update({
          where: { id: s.use.collectionItemId },
          data: {
            publicationStatus: "PRIVATE",
            publishedAt: null,
            publishedById: null,
            revision: { increment: 1 },
            updatedById: actor.userId,
          },
        });
    } else if (intent.kind === "catalog") {
      await tx.catalogAsset.update({ where: { id: intent.useId }, data });
      await tx.catalogAsset.update({
        where: { id: intent.useId },
        data: approve,
      });
    } else {
      await tx.appAsset.update({ where: { id: intent.useId }, data });
      await tx.appAsset.update({ where: { id: intent.useId }, data: approve });
    }
    return { approved: intent.approved };
  });
}
async function componentSnapshot(input: unknown, tx: TransactionClient) {
  const p = componentReviewInput.safeParse(input);
  if (!p.success) throw new PublicCollectionError("INVALID_INPUT");
  const c = await tx.gameReleaseIncludedItem.findUnique({
    where: { id: p.data.componentId },
    select: {
      id: true,
      gameReleaseId: true,
      packagingTemplate: { select: { revision: true } },
      physicalMediaTemplate: { select: { revision: true } },
    },
  });
  if (!c) throw new PublicCollectionError("NOT_FOUND");
  const templateRevision =
    c.packagingTemplate?.revision ?? c.physicalMediaTemplate?.revision;
  if (!templateRevision) throw new PublicCollectionError("INVALID_INPUT");
  // Assemble the narrow review shape without changing stored approval.
  const { reviewComponent } =
    await import("@/server/repositories/public-collection/reviews");
  const component = await reviewComponent(c.id, tx);
  if (!component) throw new PublicCollectionError("NOT_FOUND");
  const presentation = await componentPresentation(
    "00000000-0000-4000-8000-000000000000",
    { ...component, presentationTemplateRevision: templateRevision },
    tx,
  );
  if (p.data.approved && !presentation)
    throw new PublicCollectionError("INVALID_INPUT");
  const token = digest({
    input: p.data,
    component,
    versions: await reviewToken(p.data, tx),
  });
  return { c, templateRevision, presentation, reviewToken: token };
}
export function reviewComponentUse(
  context: PrivateAccessContext,
  input: unknown,
) {
  return guarded(context, async (tx) => {
    const s = await componentSnapshot(input, tx);
    return {
      reviewToken: s.reviewToken,
      name: s.presentation?.title ?? "Catalog component",
      templateRevision: s.templateRevision,
    };
  });
}
export function saveComponentUse(
  context: PrivateAccessContext,
  input: unknown,
) {
  return guarded(context, async (tx, actor) => {
    const p = componentReviewSave.safeParse(input);
    if (!p.success) throw new PublicCollectionError("INVALID_INPUT");
    const { reviewToken: expected, reviewed: _, ...intent } = p.data;
    void _;
    const s = await componentSnapshot(intent, tx);
    if (s.reviewToken !== expected) throw new PublicCollectionError("STALE");
    await tx.gameReleaseIncludedItem.update({
      where: { id: s.c.id },
      data: {
        presentationApproved: intent.approved,
        presentationReviewedAt: intent.approved ? new Date() : null,
        presentationReviewedById: intent.approved ? actor.userId : null,
        presentationTemplateRevision: intent.approved
          ? s.templateRevision
          : null,
      },
    });
    return { approved: intent.approved };
  });
}

export function mediaReviewChoices(
  context: PrivateAccessContext,
  itemId: string,
) {
  return guarded(context, async (tx) => {
    const item = await repository.mediaIdentity(itemId, tx);
    if (!item) throw new PublicCollectionError("NOT_FOUND");
    const personal = await tx.collectionItemMedia.findMany({
      where: { collectionItemId: itemId, type: { not: "SERIAL" } },
      select: { id: true, assetId: true, type: true, caption: true },
      orderBy: { id: "asc" },
      take: 50,
    });
    const catalog = await tx.catalogAsset.findMany({
      where: {
        OR: repository.catalogScopes(item),
        role: {
          in: ["COVER", "GALLERY", "SCREENSHOT", "PREVIEW", "MODEL_3D", "LOGO"],
        },
      },
      select: { id: true, assetId: true, role: true, caption: true },
      orderBy: { id: "asc" },
      take: 50,
    });
    const uses = [
      ...personal.map((u) => ({
        id: u.id,
        assetId: u.assetId,
        kind: "personal" as const,
        label:
          u.caption ??
          `Collection ${u.type.toLowerCase().replaceAll("_", " ")}`,
      })),
      ...catalog.map((u) => ({
        id: u.id,
        assetId: u.assetId,
        kind: "catalog" as const,
        label:
          u.caption ?? `Catalog ${u.role.toLowerCase().replaceAll("_", " ")}`,
      })),
    ];
    const choices = [];
    for (const use of uses) {
      let pending = [use.assetId];
      const visited = new Set<string>(),
        outputs: { id: string; label: string }[] = [];
      for (let depth = 0; pending.length && depth <= 16; depth++) {
        const rows = await tx.asset.findMany({
          where: { id: { in: pending } },
          select: {
            id: true,
            kind: true,
            state: true,
            deliveryClass: true,
            outputs: { select: { derivedAssetId: true }, take: 51 },
          },
          take: 128,
        });
        pending = [];
        for (const a of rows) {
          if (visited.has(a.id)) continue;
          visited.add(a.id);
          if (visited.size > 128) break;
          if (a.deliveryClass === "DISPLAY" && a.state === "READY")
            outputs.push({
              id: a.id,
              label: `Prepared ${a.kind === "MODEL_3D" ? "model" : "image"} ${outputs.length + 1}`,
            });
          pending.push(
            ...a.outputs
              .map((o) => o.derivedAssetId)
              .filter((id) => !visited.has(id)),
          );
        }
        if (visited.size >= 128) break;
      }
      if (outputs.length)
        choices.push({
          id: use.id,
          kind: use.kind,
          label: use.label,
          outputs: outputs.slice(0, 20),
        });
    }
    const components = item.ownedGame
      ? await tx.gameReleaseIncludedItem.findMany({
          where: {
            gameReleaseId: item.ownedGame.gameReleaseId,
            OR: [
              { packagingTemplateId: { not: null } },
              { physicalMediaTemplateId: { not: null } },
            ],
          },
          select: { id: true, name: true, presentationApproved: true },
          take: 100,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        })
      : [];
    return { uses: choices, components };
  });
}
