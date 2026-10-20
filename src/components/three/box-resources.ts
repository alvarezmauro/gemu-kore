import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  Box3,
  ClampToEdgeWrapping,
  type Texture,
} from "three";
import { ModelResources, parseModel } from "./model-resources";
import {
  ModelError,
  packagingPresentation,
  modelLimits,
  type PackagingPresentation,
} from "@/lib/three/contracts";
import {
  artworkLayout,
  faceSize,
  packagingLimits,
  type ArtworkResource,
  type PackageModelResource,
} from "@/lib/three/packaging-contracts";
import { inspectAuthoredPackage } from "@/lib/three/authored-packaging";
import { fetchModel } from "@/lib/three/fetch-model";
import { modelPresentation } from "@/lib/three/contracts";
import { fetchArtwork } from "@/lib/three/artwork-bytes";
export function boxGeometry(
  dimensions: PackagingPresentation["content"]["dimensions"],
) {
  const geometry = new BoxGeometry(
    dimensions.widthMm / 1000,
    dimensions.heightMm / 1000,
    dimensions.depthMm / 1000,
  );
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return geometry;
}
export async function loadBox(
  presentation: PackagingPresentation,
  signal: AbortSignal,
  progress: (received: number, total: number) => void,
  preparing: () => void,
) {
  const p = packagingPresentation.parse(presentation),
    owner = new ModelResources();
  const dispose = () => owner.dispose();
  signal.addEventListener("abort", dispose, { once: true });
  try {
    signal.throwIfAborted();
    const resources = [
      ...new Map<string, ArtworkResource | PackageModelResource>([
        ...(p.content.rendererVersion === "gltf-slots-v1"
          ? [[p.content.geometry.id, p.content.geometry] as const]
          : []),
        ...p.content.slots.flatMap((s) =>
          s.resource ? [[s.resource.id, s.resource] as const] : [],
        ),
      ]).values(),
    ];
    const total = resources.reduce((n, r) => n + r.byteLength, 0),
      bytes = new Map<string, Uint8Array>();
    let received = 0;
    const transferAbort = new AbortController();
    const transferSignal = AbortSignal.any([
      signal,
      transferAbort.signal,
      AbortSignal.timeout(60000),
    ]);
    let next = 0;
    try {
      await Promise.all(
        Array.from({ length: Math.min(2, resources.length) }, async () => {
          while (next < resources.length) {
            const resource = resources[next++];
            if (resource.mimeType === "model/gltf-binary") {
              let seen = 0;
              const buffer = await fetchModel(
                modelPresentation.parse({
                  schemaVersion: 1,
                  presentationKey: p.presentationKey,
                  title: p.title,
                  source: p.source,
                  description: p.description,
                  poster: null,
                  settings: p.settings,
                  resource,
                }),
                transferSignal,
                (count) => {
                  received += count - seen;
                  seen = count;
                  progress(received, total);
                },
              );
              bytes.set(resource.id, new Uint8Array(buffer));
            } else
              bytes.set(
                resource.id,
                await fetchArtwork(resource, transferSignal, (chunk) => {
                  received += chunk;
                  progress(received, total);
                }),
              );
          }
        }),
      );
    } catch (error) {
      transferAbort.abort();
      throw error;
    }
    preparing();
    signal.throwIfAborted();
    const content = p.content;
    const geometry =
      content.rendererVersion === "box-v1"
        ? boxGeometry(content.dimensions)
        : null;
    if (geometry) owner.track(geometry);
    const materials =
      content.rendererVersion === "box-v1"
        ? content.slots.map(
            () =>
              new MeshStandardMaterial({
                color: "#e8e2d6",
                roughness: 0.85,
                metalness: 0,
              }),
          )
        : [];
    materials.forEach((m) => owner.track(m));
    const textures = new Map<string, Texture>();
    if (content.rendererVersion === "gltf-slots-v1")
      inspectAuthoredPackage(
        bytes.get(content.geometry.id)!.slice().buffer,
        content.dimensions,
        content.slots.map((s) => ({ name: s.name, target: s.target })),
      );
    let outputPixels = 0;
    const deadline = performance.now() + 10000;
    const decodeSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const abortDecode = () => owner.dispose();
    decodeSignal.addEventListener("abort", abortDecode, { once: true });
    try {
      for (const slot of p.content.slots)
        if (slot.resource) {
          const r = slot.resource,
            layout = artworkLayout(
              r.width,
              r.height,
              ...("target" in slot
                ? ([slot.target.artWidthMm, slot.target.artHeightMm] as [
                    number,
                    number,
                  ])
                : faceSize(slot.face, p.content.dimensions)),
              slot.transform,
            );
          const pixels = layout.outputWidth * layout.outputHeight;
          if (
            outputPixels + pixels + r.width * r.height >
              packagingLimits.pixels ||
            ((outputPixels + pixels) * 4 * 4) / 3 > modelLimits.textureBytes
          )
            throw new ModelError();
          decodeSignal.throwIfAborted();
          const pending = createImageBitmap(
            new Blob([bytes.get(r.id)!.slice().buffer], { type: r.mimeType }),
            {
              imageOrientation: "none",
              premultiplyAlpha: "none",
              colorSpaceConversion: "none",
            },
          ).then((bitmap) => {
            owner.bitmap(bitmap);
            return bitmap;
          });
          let cancel = () => {};
          const aborted = new Promise<never>((_, reject) => {
            cancel = () => reject(new ModelError());
            decodeSignal.addEventListener("abort", cancel, { once: true });
            if (decodeSignal.aborted) cancel();
          });
          let bitmap: ImageBitmap;
          try {
            bitmap = await Promise.race([pending, aborted]);
          } finally {
            decodeSignal.removeEventListener("abort", cancel);
          }
          decodeSignal.throwIfAborted();
          if (bitmap.width !== r.width || bitmap.height !== r.height)
            throw new ModelError();
          const canvas = document.createElement("canvas");
          canvas.width = layout.outputWidth;
          canvas.height = layout.outputHeight;
          owner.canvas(canvas);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new ModelError();
          context.fillStyle = "#e8e2d6";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate((slot.transform.quarterTurns * Math.PI) / 2);
          const scale =
            layout.drawWidth /
            (slot.transform.quarterTurns % 2
              ? layout.sourceHeight
              : layout.sourceWidth);
          context.drawImage(
            bitmap,
            layout.sourceX,
            layout.sourceY,
            layout.sourceWidth,
            layout.sourceHeight,
            (-layout.sourceWidth * scale) / 2,
            (-layout.sourceHeight * scale) / 2,
            layout.sourceWidth * scale,
            layout.sourceHeight * scale,
          );
          owner.releaseBitmap(bitmap);
          const texture = new CanvasTexture(canvas);
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = false;
          texture.wrapS = ClampToEdgeWrapping;
          texture.wrapT = ClampToEdgeWrapping;
          owner.track(texture);
          textures.set(slot.name, texture);
          if ("face" in slot) {
            materials[slot.face].map = texture;
            materials[slot.face].color.set("white");
            materials[slot.face].needsUpdate = true;
          }
          outputPixels += pixels;
        }
      decodeSignal.throwIfAborted();
      if (performance.now() > deadline) throw new ModelError();
    } finally {
      decodeSignal.removeEventListener("abort", abortDecode);
    }
    signal.throwIfAborted();
    owner.check();
    if (content.rendererVersion === "gltf-slots-v1") {
      const loaded = await parseModel(
        bytes.get(content.geometry.id)!.slice().buffer,
        p.settings,
        decodeSignal,
        {
          owner,
          configure: (gltf) => {
            for (const slot of content.slots) {
              const matches: Mesh[] = [];
              gltf.scene.traverse((object) => {
                if (!(object instanceof Mesh)) return;
                const association = gltf.parser.associations.get(object);
                if (
                  association?.meshes !== slot.target.meshIndex ||
                  association.primitives !== slot.target.primitiveIndex
                )
                  return;
                let current: import("three").Object3D | null = object,
                  nodeIndex: number | undefined;
                while (current && current !== gltf.scene) {
                  const node = gltf.parser.associations.get(current)?.nodes;
                  if (node !== undefined) {
                    nodeIndex = node;
                    break;
                  }
                  current = current.parent;
                }
                if (nodeIndex === slot.target.nodeIndex) matches.push(object);
              });
              if (
                matches.length !== 1 ||
                Array.isArray(matches[0].material) ||
                !(matches[0].material instanceof MeshStandardMaterial)
              )
                throw new ModelError();
              const original = matches[0].material,
                association = gltf.parser.associations.get(original);
              if (association?.materials !== slot.target.materialIndex)
                throw new ModelError();
              const material = original.clone();
              material.map = textures.get(slot.name) ?? null;
              material.color.set(material.map ? "white" : "#e8e2d6");
              material.roughness = 0.65;
              material.metalness = 0;
              material.vertexColors = false;
              material.needsUpdate = true;
              owner.track(material);
              matches[0].material = material;
            }
          },
        },
      );
      decodeSignal.throwIfAborted();
      if (performance.now() > deadline) throw new ModelError();
      return loaded;
    }
    const root = new Group(),
      oriented = new Group();
    oriented.rotation.set(...p.settings.orientation);
    oriented.scale.setScalar(p.settings.scale);
    oriented.add(new Mesh(geometry!, materials));
    root.add(oriented);
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3()),
      scale = 2 / Math.max(...size.toArray());
    root.scale.setScalar(scale);
    root.position.copy(center).multiplyScalar(-scale);
    root.updateMatrixWorld(true);
    return { scene: root, owner, radius: (size.length() * scale) / 2 };
  } catch (error) {
    owner.dispose();
    throw error;
  } finally {
    signal.removeEventListener("abort", dispose);
  }
}
