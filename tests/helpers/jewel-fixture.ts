import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  TorusGeometry,
} from "three";
import {
  packageGeometryFixture,
  type FixturePart,
} from "./package-geometry-fixture";
import {
  jewelSlots,
  fullArtwork,
  type ArtworkResource,
} from "../../src/lib/three/packaging-contracts";
import {
  modelSettings,
  type PackagingPresentation,
} from "../../src/lib/three/contracts";
// Original closed jewel-case study, synthetic dimensions only. No disc/media model.
export function jewelFixture() {
  const dimensions = {
    schemaVersion: 1 as const,
    widthMm: 150,
    heightMm: 135,
    depthMm: 12,
  };
  const parts: FixturePart[] = [];
  function art(name: string, position: number[], normal: number[]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(
        Array.from({ length: 4 }, () => normal).flat(),
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2),
    );
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    parts.push({ name, geometry, material: parts.length });
  }
  art(
    "FRONT",
    [
      -0.061, 0.06, 0.0038, 0.068, 0.06, 0.0038, -0.061, -0.06, 0.0038, 0.068,
      -0.06, 0.0038,
    ],
    [0, 0, 1],
  );
  art(
    "BACK",
    [
      0.07, 0.062, -0.0045, -0.07, 0.062, -0.0045, 0.07, -0.062, -0.0045, -0.07,
      -0.062, -0.0045,
    ],
    [0, 0, -1],
  );
  art(
    "SPINE",
    [
      -0.0742, 0.062, -0.004, -0.0742, 0.062, 0.004, -0.0742, -0.062, -0.004,
      -0.0742, -0.062, 0.004,
    ],
    [-1, 0, 0],
  );
  art(
    "OPPOSITE_SPINE",
    [
      0.0735, 0.062, 0.004, 0.0735, 0.062, -0.004, 0.0735, -0.062, 0.004,
      0.0735, -0.062, -0.004,
    ],
    [1, 0, 0],
  );
  const add = (name: string, geometry: BufferGeometry, material = 4) =>
    parts.push({ name, geometry, material });
  // Clear lid/rear windows and four clear rim rails: six blended primitives.
  add(
    "clear-lid",
    new BoxGeometry(0.14, 0.127, 0.0008).translate(0.003, 0, 0.0056),
    5,
  );
  add(
    "clear-rear",
    new BoxGeometry(0.149, 0.134, 0.0008).translate(0, 0, -0.0056),
    5,
  );
  for (const sign of [-1, 1]) {
    add(
      `clear-rail-${sign}`,
      new BoxGeometry(0.149, 0.001, 0.01).translate(0, sign * 0.067, 0),
      5,
    );
    add(
      `clear-edge-${sign}`,
      new BoxGeometry(0.001, 0.132, 0.01).translate(sign * 0.0745, 0, 0),
      5,
    );
  }
  add("hinge-bar", new BoxGeometry(0.01, 0.128, 0.01).translate(-0.069, 0, 0));
  add(
    "disc-tray",
    new BoxGeometry(0.133, 0.126, 0.0015).translate(0.005, 0, -0.0028),
  );
  for (const y of [-0.057, 0.057])
    add(
      `hinge-pin-${y}`,
      new CylinderGeometry(0.002, 0.002, 0.01, 12).translate(-0.07, y, 0),
    );
  const recess = new TorusGeometry(0.051, 0.0012, 6, 48).translate(
    0.005,
    0,
    -0.0013,
  );
  add("tray-recess", recess);
  const hub = new CylinderGeometry(0.006, 0.006, 0.002, 16)
    .rotateX(Math.PI / 2)
    .translate(0.005, 0, -0.001);
  add("tray-hub", hub);
  // Original neutral placeholder art; no retail scans, logos or baked labels.
  const materials = [
    ...parts.slice(0, 4).map((p) => ({
      name: `art:${p.name}`,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.65,
      },
    })),
    {
      name: "synthetic-tray",
      pbrMetallicRoughness: {
        baseColorFactor: [0.025, 0.027, 0.03, 1],
        metallicFactor: 0,
        roughnessFactor: 0.6,
      },
    },
    {
      name: "synthetic-clear-plastic",
      alphaMode: "BLEND" as const,
      pbrMetallicRoughness: {
        baseColorFactor: [0.85, 0.9, 0.95, 0.18],
        metallicFactor: 0,
        roughnessFactor: 0.18,
      },
    },
  ];
  const fixture = packageGeometryFixture(
    parts,
    materials,
    "GemuKore original synthetic jewel case",
  );
  const slots = jewelSlots.parse(
    ["FRONT", "BACK", "SPINE", "OPPOSITE_SPINE"].map((name, i) => ({
      name,
      target: {
        schemaVersion: 1,
        kind: "GLB_PRIMITIVE",
        sceneIndex: 0,
        nodeIndex: i,
        meshIndex: i,
        primitiveIndex: 0,
        materialIndex: i,
        uvChannel: 0,
        nodeName: name,
        materialName: `art:${name}`,
        artWidthMm: i === 0 ? 129 : i === 1 ? 140 : 8,
        artHeightMm: i === 0 ? 120 : 124,
      },
    })),
  );
  return { dimensions, slots, ...fixture };
}
export function jewelPresentation(fixture = jewelFixture()) {
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2 as const,
    presentationKey: "synthetic-jewel",
    title: "Synthetic jewel case",
    source: "Original synthetic test fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "package" }),
    content: {
      kind: "PACKAGING" as const,
      rendererVersion: "gltf-slots-v1" as const,
      familyKey: "playstation-jewel" as const,
      componentId: crypto.randomUUID(),
      templateId: crypto.randomUUID(),
      templateRevision: 3,
      synthetic: true,
      dimensions: fixture.dimensions,
      geometry: {
        id,
        url: `/api/media/private/${id}`,
        mimeType: "model/gltf-binary" as const,
        byteLength: fixture.bytes.length,
      },
      slots: fixture.slots.map((s) => ({
        ...s,
        required: s.name !== "OPPOSITE_SPINE",
        resource: null as ArtworkResource | null,
        transform: fullArtwork,
      })),
      artworkComplete: false as boolean,
    },
  } satisfies PackagingPresentation;
}
