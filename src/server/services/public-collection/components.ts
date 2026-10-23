import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { TransactionClient } from "@/server/db/transaction";
import { publicComponents } from "@/server/repositories/public-collection/components";
import { admittedItem, assetAdmission, type MediaInput } from "./media";
import { PublicCollectionError } from "./common";
import {
  publicViewerPresentation,
  modelSettings,
  type ViewerPresentation,
} from "@/lib/three/contracts";
import { fullArtwork } from "@/lib/three/packaging-contracts";
type Component = Awaited<ReturnType<typeof publicComponents>>[number];
export async function componentPresentation(
  itemId: string,
  c: Component,
  tx: TransactionClient,
  admit = assetAdmission(tx),
): Promise<ViewerPresentation | null> {
  const packaging = c.kind === "PACKAGING",
    t = packaging
      ? c.packagingTemplate
      : c.kind === "MEDIA"
        ? c.physicalMediaTemplate
        : null;
  if (
    !t ||
    t.status !== "READY" ||
    t.revision !== c.presentationTemplateRevision
  )
    return null;
  const base = `/api/media/public/components/${itemId}/${c.id}`;
  const bindings = packaging ? c.packagingBindings : c.physicalMediaBindings;
  const artwork = new Map(
    bindings.map((b) => [b.assetId, admit(b.assetId, "IMAGE")]),
  );
  const geometryAdmission = t.baseModelAssetId
    ? admit(t.baseModelAssetId, "MODEL_3D")
    : Promise.resolve(null);
  // Await the entire bounded set even if a required slot is invalid.
  await Promise.all([...artwork.values(), geometryAdmission]);
  const resources = new Map<string, { id: string; url: string }>();
  const slots = [];
  for (const s of t.slots) {
    const b = packaging
      ? c.packagingBindings.find((b) => b.packagingTextureSlotId === s.id)
      : c.physicalMediaBindings.find(
          (b) => b.physicalMediaTextureSlotId === s.id,
        );
    const a = b ? await artwork.get(b.assetId)! : null;
    const valid =
      a &&
      a.scope === "CATALOG" &&
      Number(a.sizeBytes) <= 2 * 1024 * 1024 &&
      a.width! <= 2048 &&
      a.height! <= 2048;
    if (s.required && !valid) return null;
    const resource = valid
      ? {
          id: s.id,
          url: `${base}/${s.name}`,
          mimeType: a.mimeType,
          byteLength: Number(a.sizeBytes),
          width: a.width,
          height: a.height,
        }
      : null;
    // Same immutable asset must keep one URL inside an assembled descriptor.
    if (resource && a) {
      const prior = resources.get(a.id);
      if (prior) {
        resource.id = prior.id;
        resource.url = prior.url;
      } else resources.set(a.id, { id: resource.id, url: resource.url });
    }
    const target = z
      .strictObject({
        schemaVersion: z.literal(1),
        kind: z.literal("PROCEDURAL_FACE"),
        face: z.number().int().min(0).max(5),
      })
      .safeParse(s.target);
    slots.push({
      name: s.name,
      required: s.required,
      ...(t.geometryType === "PROCEDURAL_BOX"
        ? { face: target.success ? target.data.face : -1 }
        : { target: s.target }),
      resource,
      transform: b?.transform ?? fullArtwork,
    });
  }
  const geometry = await geometryAdmission;
  if (t.geometryType === "GLB" && (!geometry || geometry.scope !== "CATALOG"))
    return null;
  const m = z.object({ synthetic: z.boolean() }).safeParse(t.metadata);
  if (!m.success) return null;
  const content = {
    kind: packaging ? "PACKAGING" : "PHYSICAL_MEDIA",
    rendererVersion:
      t.geometryType === "PROCEDURAL_BOX"
        ? "box-v1"
        : packaging
          ? "gltf-slots-v1"
          : "cartridge-v1",
    familyKey: t.familyKey,
    ...(packaging ? {} : { type: "CARTRIDGE" }),
    componentId: c.id,
    templateId: t.id,
    templateRevision: t.revision,
    synthetic: m.data.synthetic,
    dimensions: t.dimensions,
    slots,
    ...(geometry
      ? {
          geometry: {
            id: t.id,
            url: `${base}/geometry`,
            mimeType: geometry.mimeType,
            byteLength: Number(geometry.sizeBytes),
          },
        }
      : {}),
    artworkComplete: slots.every((s) => !s.required || s.resource !== null),
  };
  const settings = modelSettings.safeParse(t.cameraSettings);
  if (!settings.success) return null;
  const result = publicViewerPresentation.safeParse({
    schemaVersion: 2,
    presentationKey: createHash("sha256")
      .update(JSON.stringify({ itemId, content }))
      .digest("hex"),
    title: c.name,
    source: m.data.synthetic
      ? "Expected catalog component · synthetic demonstration"
      : "Expected catalog component",
    description:
      "Catalog geometry and artwork show expected contents, not the condition or confirmed presence of this copy’s components.",
    poster: null,
    settings: settings.data,
    content,
  });
  return result.success ? result.data : null;
}
export async function publicComponentViews(
  itemId: string,
  tx: TransactionClient,
) {
  const item = await admittedItem(itemId, tx);
  if (item.type !== "GAME" || !item.ownedGame) return [];
  const views: { id: string; name: string }[] = [];
  const components = await publicComponents(item.ownedGame.gameReleaseId, tx);
  const admit = assetAdmission(tx);
  for (let start = 0; start < components.length; start += 12) {
    const batch = components.slice(start, start + 12);
    const presentations = await Promise.all(
      batch.map((c) => componentPresentation(itemId, c, tx, admit)),
    );
    for (const [index, c] of batch.entries()) {
      if (presentations[index]) views.push({ id: c.id, name: c.name });
      if (views.length === 12) return views;
    }
  }
  return views;
}
export async function resolveComponentAsset(
  input: Extract<MediaInput, { context: "component" }>,
  tx: TransactionClient,
) {
  const item = await admittedItem(input.itemId, tx);
  if (item.type !== "GAME" || !item.ownedGame)
    throw new PublicCollectionError("NOT_FOUND");
  const c = (await publicComponents(item.ownedGame.gameReleaseId, tx)).find(
    (c) => c.id === input.componentId,
  );
  const admit = assetAdmission(tx);
  const presentation = c
    ? await componentPresentation(item.id, c, tx, admit)
    : null;
  if (!presentation || presentation.schemaVersion !== 2) return null;
  const content = presentation.content;
  const resource =
    input.slotKey === "geometry"
      ? content.rendererVersion !== "box-v1"
        ? content.geometry
        : null
      : content.slots.find((s) => s.name === input.slotKey)?.resource;
  if (!resource || !c) return null;
  const template =
    c.kind === "PACKAGING" ? c.packagingTemplate : c.physicalMediaTemplate;
  if (!template) return null;
  const slot = template.slots.find((s) => s.name === input.slotKey);
  const binding =
    c.kind === "PACKAGING"
      ? c.packagingBindings.find((b) => b.packagingTextureSlotId === slot?.id)
      : c.physicalMediaBindings.find(
          (b) => b.physicalMediaTextureSlotId === slot?.id,
        );
  const assetId =
    input.slotKey === "geometry" ? template.baseModelAssetId : binding?.assetId;
  return assetId
    ? admit(assetId, input.slotKey === "geometry" ? "MODEL_3D" : "IMAGE")
    : null;
}
