import "server-only";
import { managementPage } from "@/features/collection/copy-choices";
import type { MediaItem, Photo, PhotoType } from "@/features/media/contracts";
import { mediaItemId, mediaMutation } from "@/features/media/validation";
import type { PrivateAccessContext } from "../../auth/access";
import { requirePermission } from "../../auth/permissions";
import { withTransaction } from "../../db/transaction";
import { canPerform } from "../../policies/permissions";
import {
  advanceCollectionItem,
  findCollectionItem,
  listCollectionItemOptions,
  lockCollectionItem,
} from "../../repositories/collection/items";
import {
  listItemPhotos,
  photoPublicationPolicy,
  removePhoto,
  reorderPhotos,
  updatePhoto,
} from "../../repositories/collection/media";
import { itemOption } from "./items";
import { lockAssets } from "../../repositories/assets";
export class MediaError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the photo details. Captions can contain up to 2,000 characters and image descriptions up to 1,000.",
        NOT_FOUND:
          "This collection copy or photo no longer exists. Refresh the page and try again.",
        STALE:
          "This copy changed while you were editing. Refresh the page before trying again.",
        UNAVAILABLE:
          "Photos are unavailable right now. Please try again in a moment.",
      }[code],
    );
    this.name = "MediaError";
  }
}
function photoSummary(
  row: Awaited<ReturnType<typeof listItemPhotos>>[number],
): Photo {
  const asset = row.asset;
  // Resolve only the pipeline's ready thumbnail sibling; no raw manifest or keys enter the DTO.
  const thumbnail = asset.inputs
    .flatMap((input) => input.sourceAsset.outputs)
    .map((output) => output.derivedAsset)
    .find((candidate) => {
      const metadata = candidate.transformMetadata;
      return (
        candidate.state === "READY" &&
        candidate.kind === "IMAGE" &&
        candidate.deliveryClass === "DISPLAY" &&
        metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        "data" in metadata &&
        metadata.data &&
        typeof metadata.data === "object" &&
        !Array.isArray(metadata.data) &&
        metadata.data.variant === "thumbnail"
      );
    });
  return {
    id: row.id,
    type: row.type as PhotoType,
    caption: row.caption,
    altText: row.altText,
    publicApproved: row.publicApproved,
    displayUrl: `/api/media/private/${asset.id}`,
    thumbnailUrl: `/api/media/private/${thumbnail?.id ?? asset.id}`,
    width: asset.width ?? 1,
    height: asset.height ?? 1,
  };
}
export async function getMediaManagement(
  context: PrivateAccessContext,
  itemId?: unknown,
  page: unknown = 0,
) {
  await requirePermission(context, "private.read");
  if (itemId !== undefined && !mediaItemId.safeParse(itemId).success)
    throw new MediaError("NOT_FOUND");
  const parsedPage = managementPage.safeParse(page);
  if (!parsedPage.success) throw new MediaError("NOT_FOUND");
  try {
    return await withTransaction(
      async (tx) => {
        const current = await requirePermission(context, "private.read", tx);
        const choices = await listCollectionItemOptions(tx, {
          query: "",
          page: parsedPage.data,
        });
        const items = choices.slice(0, 25).map(itemOption);
        const id = itemId === undefined ? items[0]?.id : (itemId as string);
        const item = id ? await findCollectionItem(id, tx) : null;
        if (id && !item) throw new MediaError("NOT_FOUND");
        const rows = item ? await listItemPhotos(item.id, tx) : [];
        return {
          items,
          copyPage: parsedPage.data,
          hasMoreCopies: choices.length > 25,
          selected: item
            ? ({
                ...itemOption(item),
                revision: item.revision,
              } satisfies MediaItem)
            : null,
          photos: rows
            .filter(
              (row) =>
                row.asset.state === "READY" && row.asset.kind === "IMAGE",
            )
            .map(photoSummary),
          canManage: canPerform(current.role, "media.manage"),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("UNAVAILABLE");
  }
}
export async function mutateMedia(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  await withTransaction(
    async (tx) => {
      await requirePermission(context, "media.manage", tx);
      const parsed = mediaMutation.safeParse(input);
      if (!parsed.success) throw new MediaError("INVALID_INPUT");
      const data = parsed.data;
      await lockCollectionItem(data.collectionItemId, tx);
      const current = await requirePermission(context, "media.manage", tx);
      const item = await findCollectionItem(data.collectionItemId, tx);
      if (!item) throw new MediaError("NOT_FOUND");
      if (item.revision !== data.expectedRevision)
        throw new MediaError("STALE");
      const rows = await listItemPhotos(item.id, tx);
      let affectsPublic = false;
      if (data.operation === "reorder") {
        if (
          rows.length !== data.ids.length ||
          rows.some((row) => !data.ids.includes(row.id))
        )
          throw new MediaError("NOT_FOUND");
        if (rows.every((row, index) => row.id === data.ids[index])) return;
        affectsPublic = rows.some((row) => row.publicApproved);
        // Uses may share files across copies. Acquire these locks consistently
        // before individual use triggers to avoid reorder deadlocks.
        await lockAssets(
          rows.map((row) => row.asset.id),
          tx,
        );
        await reorderPhotos(data.ids, tx);
      } else {
        const row = rows.find((row) => row.id === data.id);
        if (!row) throw new MediaError("NOT_FOUND");
        if (
          data.operation === "update" &&
          row.type === data.type &&
          row.caption === data.caption &&
          row.altText === data.altText
        )
          return;
        affectsPublic = row.publicApproved;
        if (data.operation === "delete") await removePhoto(data.id, tx);
        else
          await updatePhoto(
            data.id,
            { type: data.type, caption: data.caption, altText: data.altText },
            tx,
          );
      }
      const policy = await photoPublicationPolicy(tx);
      const advanced = await advanceCollectionItem(
        item.id,
        item.revision,
        current.userId,
        affectsPublic &&
          policy.showPersonalPhotos &&
          item.publicationStatus === "PUBLISHED",
        tx,
      );
      if (advanced.count !== 1) throw new MediaError("STALE");
    },
    { isolationLevel: "ReadCommitted" },
  );
}
