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
} from "three";
import { ModelResources } from "./model-resources";
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
} from "@/lib/three/packaging-contracts";
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
      ...new Map(
        p.content.slots.flatMap((s) =>
          s.resource ? [[s.resource.id, s.resource] as const] : [],
        ),
      ).values(),
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
    const geometry = boxGeometry(p.content.dimensions);
    owner.track(geometry);
    const materials = p.content.slots.map(
      () =>
        new MeshStandardMaterial({
          color: "#e8e2d6",
          roughness: 0.85,
          metalness: 0,
        }),
    );
    materials.forEach((m) => owner.track(m));
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
              ...faceSize(slot.face, p.content.dimensions),
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
          materials[slot.face].map = texture;
          materials[slot.face].color.set("white");
          materials[slot.face].needsUpdate = true;
          outputPixels += pixels;
        }
      decodeSignal.throwIfAborted();
      if (performance.now() > deadline) throw new ModelError();
    } finally {
      decodeSignal.removeEventListener("abort", abortDecode);
    }
    signal.throwIfAborted();
    owner.check();
    const root = new Group(),
      oriented = new Group();
    oriented.rotation.set(...p.settings.orientation);
    oriented.scale.setScalar(p.settings.scale);
    oriented.add(new Mesh(geometry, materials));
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
