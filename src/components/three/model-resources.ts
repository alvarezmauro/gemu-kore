import {
  Box3,
  BufferGeometry,
  Group,
  LoadingManager,
  Material,
  Mesh,
  Texture,
  Vector3,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  ModelError,
  modelLimits,
  type ModelSettings,
} from "@/lib/three/contracts";
import { inspectModel } from "@/lib/three/profile";
export class ModelResources {
  private geometries = new Set<BufferGeometry>();
  private materials = new Set<Material>();
  private textures = new Set<Texture>();
  private bitmaps = new Set<{ close: () => void }>();
  private closedBitmaps = new Set<{ close: () => void }>();
  private objects = new Set<Object3D>();
  private closed = false;
  track(value: unknown) {
    if (value instanceof Texture) {
      if (this.textures.has(value)) return;
      this.textures.add(value);
      const data: unknown = value.source?.data;
      if (
        data &&
        typeof data === "object" &&
        "close" in data &&
        typeof data.close === "function"
      )
        this.bitmaps.add(data as { close: () => void });
      if (this.closed) {
        value.dispose();
        this.closeBitmaps();
      }
    } else if (value instanceof Material) {
      if (this.materials.has(value)) return;
      this.materials.add(value);
      for (const property of Object.values(value))
        if (property instanceof Texture) this.track(property);
      if (this.closed) value.dispose();
    } else if (value instanceof BufferGeometry) {
      if (this.geometries.has(value)) return;
      this.geometries.add(value);
      if (this.closed) value.dispose();
    } else if (
      value &&
      typeof value === "object" &&
      "traverse" in value &&
      typeof value.traverse === "function"
    ) {
      (value as Object3D).traverse((node) => {
        if (this.objects.has(node)) return;
        this.objects.add(node);
        if (node instanceof Mesh) {
          this.track(node.geometry);
          for (const material of Array.isArray(node.material)
            ? node.material
            : [node.material])
            this.track(material);
        }
      });
    }
  }
  private closeBitmaps() {
    for (const bitmap of this.bitmaps) {
      if (!this.closedBitmaps.has(bitmap)) {
        bitmap.close();
        this.closedBitmaps.add(bitmap);
      }
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.closeBitmaps();
  }
  check() {
    const arrays = new Set<ArrayBufferLike>();
    let bytes = 0;
    for (const geometry of this.geometries) {
      for (const attribute of [
        ...Object.values(geometry.attributes),
        ...(geometry.index ? [geometry.index] : []),
      ]) {
        const array =
          "data" in attribute ? attribute.data.array : attribute.array;
        if (!arrays.has(array.buffer)) {
          arrays.add(array.buffer);
          bytes += array.buffer.byteLength;
        }
      }
    }
    if (
      bytes > modelLimits.geometryBytes ||
      this.materials.size > modelLimits.materials ||
      this.textures.size > modelLimits.textures
    )
      throw new ModelError();
  }
}
export async function parseModel(
  bytes: ArrayBuffer,
  settings: ModelSettings,
  signal: AbortSignal,
) {
  inspectModel(bytes);
  signal.throwIfAborted();
  const owner = new ModelResources();
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith("blob:")) throw new ModelError();
    return url;
  });
  const loader = new GLTFLoader(manager);
  // Capture dependency completion, including allocations finishing after cancellation or parser failure.
  loader.register((parser) => {
    const dependency = parser.getDependency.bind(parser);
    parser.getDependency = async (type, index) => {
      const resource: unknown = await dependency(type, index);
      owner.track(resource);
      return resource;
    };
    return { name: "GemuKoreResourceOwner" };
  });
  let rejectAbort: (error: unknown) => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    owner.dispose();
    rejectAbort(signal.reason);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const gltf = await Promise.race([
      loader.parseAsync(bytes, ""),
      interrupted,
    ]);
    gltf.scenes.forEach((scene) => owner.track(scene));
    signal.throwIfAborted();
    owner.check();
    const root = new Group(),
      orientation = new Group();
    orientation.rotation.set(...settings.orientation);
    orientation.scale.setScalar(settings.scale);
    orientation.add(gltf.scene);
    root.add(orientation);
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (
      ![...size.toArray(), ...center.toArray(), longest].every(
        Number.isFinite,
      ) ||
      longest <= 0 ||
      longest > 1e12
    )
      throw new ModelError();
    const scale = 2 / longest;
    root.scale.setScalar(scale);
    root.position.copy(center).multiplyScalar(-scale);
    root.updateMatrixWorld(true);
    return { scene: root, owner, radius: (size.length() * scale) / 2 };
  } catch (error) {
    owner.dispose();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
