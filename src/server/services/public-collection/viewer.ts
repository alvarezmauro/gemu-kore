import "server-only";
import { z } from "zod";
import { publicRead, enabled, PublicCollectionError } from "./common";
import { publicItemMedia, resolveItemUse, admittedItem } from "./media";
import { publicComponents } from "@/server/repositories/public-collection/components";
import { componentPresentation } from "./components";
import { modelSettings, publicViewerPresentation } from "@/lib/three/contracts";
export const publicViewInput = z.strictObject({
  itemId: z.uuid(),
  componentId: z.uuid().optional(),
});
export function getPublicPresentation(input: unknown) {
  return publicRead(async (tx, policy) => {
    enabled(policy);
    const p = publicViewInput.safeParse(input);
    if (!p.success) throw new PublicCollectionError("NOT_FOUND");
    const { itemId, componentId } = p.data;
    const item = await admittedItem(itemId, tx);
    if (componentId) {
      if (item.type !== "GAME" || !item.ownedGame)
        throw new PublicCollectionError("NOT_FOUND");
      const c = (await publicComponents(item.ownedGame.gameReleaseId, tx)).find(
        (c) => c.id === componentId,
      );
      const result = c ? await componentPresentation(itemId, c, tx) : null;
      if (!result) throw new PublicCollectionError("NOT_FOUND");
      return result;
    }
    const media = await publicItemMedia(itemId, policy, tx),
      model = media.model;
    if (!model) throw new PublicCollectionError("NOT_FOUND");
    const a = await resolveItemUse(
      { context: "item", itemId, kind: model.kind, useId: model.useId },
      policy,
      tx,
    );
    return publicViewerPresentation.parse({
      schemaVersion: 1,
      presentationKey: `public:${itemId}:${model.kind}:${model.useId}`,
      title: "Collection object",
      source: model.source,
      description:
        "Approved collection artwork. Physical condition is described separately.",
      resource: {
        id: model.useId,
        url: `/api/media/public/items/${itemId}/${model.kind}/${model.useId}`,
        mimeType: a.mimeType,
        byteLength: Number(a.sizeBytes),
      },
      poster: null,
      settings: modelSettings.parse({
        preset: item.type === "CONSOLE" ? "console" : "object",
      }),
    });
  });
}
