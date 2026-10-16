import {
  InstancedMesh,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ModelSettings } from "@/lib/three/contracts";
import { cameraFit } from "@/lib/three/camera";
type CameraControls = {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  enableDamping: boolean;
  autoRotate: boolean;
};
// Imperative Three objects belong to the renderer, not React state.
export function fitModelCamera(
  camera: PerspectiveCamera,
  controls: CameraControls,
  radius: number,
  aspect: number,
  settings: ModelSettings,
  reset: boolean,
) {
  const damping = controls.enableDamping,
    rotation = controls.autoRotate;
  if (reset) {
    // Consume pending drag deltas before placing the camera at its reset pose.
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.update();
  }
  const frame = cameraFit(radius, aspect, settings);
  const direction = reset
    ? new Vector3(
        ...(settings.preset === "console"
          ? ([3, 2, 4] as const)
          : ([4, 3, 5] as const)),
      )
    : camera.position.clone().sub(controls.target);
  const distance = reset
    ? frame.distance
    : Math.max(frame.distance, Math.min(frame.maxDistance, direction.length()));
  controls.target.set(...settings.targetOffset);
  camera.position
    .copy(direction.normalize().multiplyScalar(distance))
    .add(controls.target);
  camera.fov = settings.fov;
  camera.near = frame.near;
  camera.far = frame.far;
  camera.updateProjectionMatrix();
  controls.minDistance = frame.minDistance;
  controls.maxDistance = frame.maxDistance;
  controls.update();
  controls.enableDamping = damping;
  controls.autoRotate = rotation;
}
export function installStudio(gl: WebGLRenderer, scene: Scene) {
  const room = new RoomEnvironment(),
    generator = new PMREMGenerator(gl);
  let target: ReturnType<PMREMGenerator["fromScene"]> | undefined;
  try {
    target = generator.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    scene.environment = target.texture;
  } catch {
    /* The scene's basic lights remain usable without reflections. */
  } finally {
    // Only the baked target is needed during viewing. RoomEnvironment.dispose()
    // releases shared geometry/materials but omits its instanced mesh buffers.
    room.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    room.dispose();
    generator.dispose();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (scene.environment === target?.texture) scene.environment = null;
    target?.dispose();
  };
}
