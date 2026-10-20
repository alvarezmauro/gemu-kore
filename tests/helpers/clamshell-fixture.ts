import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
} from "three";
import { packageGeometryFixture } from "./package-geometry-fixture";
import { clamshellSlots } from "../../src/lib/three/packaging-contracts";
// Original synthetic closed clamshell: two rounded shells, separated rim lips,
// hinge barrels and a clasp. Dimensions are demonstration values, never retail data.
export function clamshellFixture() {
  const dimensions = {
    schemaVersion: 1 as const,
    widthMm: 120,
    heightMm: 180,
    depthMm: 28,
  };
  const parts: { name: string; geometry: BufferGeometry; material: number }[] =
    [];
  const art = (name: string, positions: number[], normal: number[]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
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
  };
  art(
    "FRONT",
    [
      -0.054, 0.083, 0.0137, 0.054, 0.083, 0.0137, -0.054, -0.083, 0.0137,
      0.054, -0.083, 0.0137,
    ],
    [0, 0, 1],
  );
  art(
    "BACK",
    [
      0.054, 0.083, -0.0137, -0.054, 0.083, -0.0137, 0.054, -0.083, -0.0137,
      -0.054, -0.083, -0.0137,
    ],
    [0, 0, -1],
  );
  art(
    "SPINE",
    [
      -0.0601, 0.083, -0.011, -0.0601, 0.083, 0.011, -0.0601, -0.083, -0.011,
      -0.0601, -0.083, 0.011,
    ],
    [-1, 0, 0],
  );
  const shell = new Shape(),
    x = 0.059,
    y = 0.0894,
    r = 0.004;
  shell.moveTo(-x + r, -y);
  shell.lineTo(x - r, -y);
  shell.quadraticCurveTo(x, -y, x, -y + r);
  shell.lineTo(x, y - r);
  shell.quadraticCurveTo(x, y, x - r, y);
  shell.lineTo(-x + r, y);
  shell.quadraticCurveTo(-x, y, -x, y - r);
  shell.lineTo(-x, -y + r);
  shell.quadraticCurveTo(-x, -y, -x + r, -y);
  for (const sign of [-1, 1]) {
    const geometry = new ExtrudeGeometry(shell, {
      depth: 0.012,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 2,
      curveSegments: 4,
    });
    geometry.translate(0, 0, 0.001);
    if (sign < 0) geometry.rotateY(Math.PI);
    parts.push({
      name: sign > 0 ? "front-shell" : "back-shell",
      geometry,
      material: 3,
    });
    for (const edge of [-1, 1]) {
      const lip = new BoxGeometry(0.112, 0.0012, 0.0015).translate(
        0,
        edge * 0.087,
        sign * 0.0018,
      );
      parts.push({ name: `rim-${sign}-${edge}`, geometry: lip, material: 3 });
    }
  }
  for (const y of [-0.059, 0.059])
    parts.push({
      name: `hinge-${y}`,
      geometry: new CylinderGeometry(0.0022, 0.0022, 0.019, 12).translate(
        -0.0578,
        y,
        0,
      ),
      material: 3,
    });
  parts.push({
    name: "clasp",
    geometry: new BoxGeometry(0.002, 0.015, 0.006).translate(0.059, 0, 0),
    material: 3,
  });
  const fixture = packageGeometryFixture(
    parts,
    [
      ...parts.slice(0, 3).map((p) => ({
        name: `art:${p.name}`,
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.65,
        },
      })),
      {
        name: "synthetic-plastic",
        pbrMetallicRoughness: {
          baseColorFactor: [0.035, 0.04, 0.05, 1],
          metallicFactor: 0,
          roughnessFactor: 0.65,
        },
      },
    ],
    "GemuKore original synthetic clamshell",
  );
  const slots = clamshellSlots.parse(
    ["FRONT", "BACK", "SPINE"].map((name, i) => ({
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
        artWidthMm: i === 2 ? 22 : 108,
        artHeightMm: 166,
      },
    })),
  );
  return {
    dimensions,
    slots,
    ...fixture,
  };
}
export function clamshellPresentation(fixture = clamshellFixture()) {
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2 as const,
    presentationKey: "synthetic-clamshell",
    title: "Synthetic clamshell",
    source: "Original synthetic test fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "package" }),
    content: {
      kind: "PACKAGING" as const,
      rendererVersion: "gltf-slots-v1" as const,
      familyKey: "genesis-clamshell" as const,
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
        required: true as const,
        resource: null as ArtworkResource | null,
        transform: fullArtwork,
      })),
      artworkComplete: false as boolean,
    },
  } satisfies PackagingPresentation;
}
import {
  modelSettings,
  type PackagingPresentation,
} from "../../src/lib/three/contracts";
import {
  fullArtwork,
  type ArtworkResource,
} from "../../src/lib/three/packaging-contracts";
