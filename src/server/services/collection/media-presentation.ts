import "server-only";
import { createHash } from "node:crypto";
import type { PrivateAccessContext } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import * as repository from "@/server/repositories/catalog/physical-media";
import { cartridgeTemplateDto, MediaError } from "../catalog/physical-media";
import { cartridgeViewRequest } from "@/features/physical-media/validation";
import {
  artworkResource,
  textureTransform,
  packagingLimits,
} from "@/lib/three/packaging-contracts";
import { cartridgePresentation, modelSettings } from "@/lib/three/contracts";
import { cartridgeTemplateMetadata } from "@/features/physical-media/template-metadata";
import type { MediaComponent } from "@/features/physical-media/contracts";
type Component = NonNullable<
  Awaited<ReturnType<typeof repository.physicalMediaRelease>>
>["includedItems"][number];
function content(c: Component) {
  if (!c.physicalMediaTemplate || c.physicalMediaTemplate.status !== "READY")
    return null;
  const template = cartridgeTemplateDto(c.physicalMediaTemplate);
  function artwork(s: (typeof template.slots)[number]) {
    const binding = c.physicalMediaBindings.find(
        (b) => b.physicalMediaTextureSlotId === s.id,
      ),
      a = binding?.asset;
    const parsed =
      a &&
      a.state === "READY" &&
      a.kind === "IMAGE" &&
      a.scope === "CATALOG" &&
      a.deliveryClass === "DISPLAY"
        ? artworkResource.safeParse({
            id: a.id,
            url: `/api/media/private/${a.id}`,
            mimeType: a.mimeType,
            byteLength: Number(a.sizeBytes),
            width: a.width,
            height: a.height,
          })
        : null;
    return {
      resource: parsed?.success ? parsed.data : null,
      transform: textureTransform.parse(
        binding?.transform ?? {
          schemaVersion: 1,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          quarterTurns: 0,
        },
      ),
    };
  }
  const identity = {
    kind: "PHYSICAL_MEDIA" as const,
    componentId: c.id,
    templateId: template.id,
    templateRevision: template.revision,
    synthetic: template.synthetic,
    dimensions: template.dimensions,
  };
  if (!template.baseModel) return null;
  const slots = template.slots.map((s) => ({
    name: "FRONT_LABEL" as const,
    required: true as const,
    target: s.target!,
    ...artwork(s),
  }));
  return {
    ...identity,
    type: "CARTRIDGE" as const,
    rendererVersion: "cartridge-v1" as const,
    familyKey: "cartridge" as const,
    geometry: template.baseModel,
    slots,
    artworkComplete: slots.every((s) => s.resource !== null),
  };
}
export async function readMediaComponents(
  releaseId: string,
  tx: TransactionClient,
): Promise<MediaComponent[]> {
  const release = await repository.physicalMediaRelease(releaseId, tx);
  if (!release) return [];
  return release.includedItems
    .filter((c) => c.kind === "MEDIA")
    .map((c) => {
      let value: ReturnType<typeof content> = null;
      try {
        value = content(c);
      } catch {
        /* Invalid contracts preserve static expected contents. */
      }
      const unique = new Map(
        value?.slots.flatMap((s) =>
          s.resource ? [[s.resource.id, s.resource] as const] : [],
        ),
      );
      const within =
        [...unique.values()].reduce(
          (n, r) => n + r.byteLength,
          value?.rendererVersion === "cartridge-v1"
            ? value.geometry.byteLength
            : 0,
        ) <= packagingLimits.bytes &&
        [...unique.values()].reduce((n, r) => n + r.width * r.height, 0) <=
          packagingLimits.pixels;
      const metadata = cartridgeTemplateMetadata.safeParse(
        c.physicalMediaTemplate?.metadata,
      );
      return {
        media: true,
        format: metadata.success ? metadata.data.format : null,
        id: c.id,
        name: c.name,
        quantity: c.quantity,
        templateName: c.physicalMediaTemplate?.name ?? null,
        familyKey: value?.familyKey ?? null,
        synthetic: value?.synthetic ?? false,
        available: Boolean(value && within),
        artworkComplete: value?.artworkComplete ?? false,
        notice: !value
          ? "No ready cartridge preview is available."
          : !within
            ? "Artwork exceeds the interactive preview limits. Static details remain available."
            : !value.artworkComplete
              ? "Artwork incomplete. Missing surfaces use a neutral material."
              : "Catalog artwork is available for this expected component.",
      };
    });
}
export async function getGameCartridgePresentation(
  context: PrivateAccessContext,
  input: unknown,
) {
  const p = cartridgeViewRequest.safeParse(input);
  if (!p.success) throw new MediaError("INVALID_INPUT");
  const d = p.data;
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "private.read", tx);
      const copy = await repository.physicalMediaCopy(d.collectionItemId, tx);
      if (!copy || copy.type !== "GAME" || !copy.ownedGame)
        throw new MediaError("NOT_FOUND");
      if (copy.revision !== d.expectedCopyRevision)
        throw new MediaError("STALE");
      const release = await repository.physicalMediaRelease(
        copy.ownedGame.gameReleaseId,
        tx,
      );
      if (!release) throw new MediaError("NOT_FOUND");
      if (release.revision !== d.expectedReleaseRevision)
        throw new MediaError("STALE");
      const component = release.includedItems.find(
        (c) => c.id === d.componentId && c.kind === "MEDIA",
      );
      if (!component) throw new MediaError("NOT_FOUND");
      const assembled = content(component);
      if (!assembled) throw new MediaError("NOT_FOUND");
      const settings = modelSettings.parse(
        component.physicalMediaTemplate!.cameraSettings,
      );
      const presentationKey = createHash("sha256")
        .update(
          JSON.stringify({
            copy: copy.id,
            revision: copy.revision,
            releaseRevision: release.revision,
            assembled,
            settings,
          }),
        )
        .digest("hex");
      return cartridgePresentation.parse({
        schemaVersion: 2,
        presentationKey,
        title: `${release.game.name} · ${component.name}`,
        source: assembled.synthetic
          ? "Expected catalog media · synthetic demonstration"
          : "Expected catalog media",
        description:
          "Catalog geometry and artwork, not the condition or confirmed presence of this copy's media.",
        poster: null,
        settings,
        content: assembled,
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
