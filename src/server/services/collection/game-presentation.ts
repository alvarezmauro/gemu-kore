import "server-only";
import { createHash } from "node:crypto";
import type { PrivateAccessContext } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import * as repository from "@/server/repositories/catalog/physical-editions";
import { boxTemplateDto, PackagingError } from "../catalog/physical-editions";
import { boxViewRequest } from "@/features/physical-editions/validation";
import {
  artworkResource,
  authoredFamily,
  authoredSlotName,
  textureTransform,
  packagingLimits,
} from "@/lib/three/packaging-contracts";
import { packagingPresentation, modelSettings } from "@/lib/three/contracts";
import type { PackagingComponent } from "@/features/physical-editions/contracts";
type Component = NonNullable<
  Awaited<ReturnType<typeof repository.packagingRelease>>
>["includedItems"][number];
function content(c: Component) {
  if (!c.packagingTemplate || c.packagingTemplate.status !== "READY")
    return null;
  const template = boxTemplateDto(c.packagingTemplate);
  function artwork(s: (typeof template.slots)[number]) {
    const binding = c.packagingBindings.find(
        (b) => b.packagingTextureSlotId === s.id,
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
    kind: "PACKAGING" as const,
    componentId: c.id,
    templateId: template.id,
    templateRevision: template.revision,
    synthetic: template.synthetic,
    dimensions: template.dimensions,
  };
  if (template.geometryType === "GLB") {
    if (!template.baseModel) return null;
    const slots = template.slots.map((s) => ({
      name: authoredSlotName.parse(s.name),
      required: s.required,
      target: s.target!,
      ...artwork(s),
    }));
    return {
      ...identity,
      rendererVersion: "gltf-slots-v1" as const,
      familyKey: authoredFamily.parse(template.familyKey),
      geometry: template.baseModel,
      slots,
      artworkComplete: slots.every((s) => !s.required || s.resource !== null),
    };
  }
  const slots = template.slots.map((s) => ({
    face: s.face!,
    name: s.name,
    required: s.required,
    ...artwork(s),
  }));
  return {
    ...identity,
    rendererVersion: "box-v1" as const,
    familyKey: template.familyKey,
    slots,
    artworkComplete: slots.every((s) => !s.required || s.resource !== null),
  };
}
export async function readPackagingComponents(
  releaseId: string,
  tx: TransactionClient,
): Promise<PackagingComponent[]> {
  const release = await repository.packagingRelease(releaseId, tx);
  if (!release) return [];
  return release.includedItems
    .filter((c) => c.kind === "PACKAGING")
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
          value?.rendererVersion === "gltf-slots-v1"
            ? value.geometry.byteLength
            : 0,
        ) <= packagingLimits.bytes &&
        [...unique.values()].reduce((n, r) => n + r.width * r.height, 0) <=
          packagingLimits.pixels;
      return {
        id: c.id,
        name: c.name,
        quantity: c.quantity,
        templateName: c.packagingTemplate?.name ?? null,
        familyKey: value?.familyKey ?? null,
        synthetic: value?.synthetic ?? false,
        available: Boolean(value && within),
        artworkComplete: value?.artworkComplete ?? false,
        notice: !value
          ? "No ready packaging preview is available."
          : !within
            ? "Artwork exceeds the interactive preview limits. Static details remain available."
            : !value.artworkComplete
              ? "Artwork incomplete. Missing surfaces use a neutral material."
              : "Catalog artwork is available for this expected component.",
      };
    });
}
export async function getGamePackagingPresentation(
  context: PrivateAccessContext,
  input: unknown,
) {
  const p = boxViewRequest.safeParse(input);
  if (!p.success) throw new PackagingError("INVALID_INPUT");
  const d = p.data;
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "private.read", tx);
      const copy = await repository.packagingCopy(d.collectionItemId, tx);
      if (!copy || copy.type !== "GAME" || !copy.ownedGame)
        throw new PackagingError("NOT_FOUND");
      if (copy.revision !== d.expectedCopyRevision)
        throw new PackagingError("STALE");
      const release = await repository.packagingRelease(
        copy.ownedGame.gameReleaseId,
        tx,
      );
      if (!release) throw new PackagingError("NOT_FOUND");
      if (release.revision !== d.expectedReleaseRevision)
        throw new PackagingError("STALE");
      const component = release.includedItems.find(
        (c) => c.id === d.componentId && c.kind === "PACKAGING",
      );
      if (!component) throw new PackagingError("NOT_FOUND");
      const assembled = content(component);
      if (!assembled) throw new PackagingError("NOT_FOUND");
      const settings = modelSettings.parse(
        component.packagingTemplate!.cameraSettings,
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
      return packagingPresentation.parse({
        schemaVersion: 2,
        presentationKey,
        title: `${release.game.name} · ${component.name}`,
        source: assembled.synthetic
          ? "Expected catalog packaging · synthetic demonstration"
          : "Expected catalog packaging",
        description:
          "Catalog geometry and artwork, not the condition or confirmed presence of this copy's packaging.",
        poster: null,
        settings,
        content: assembled,
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
