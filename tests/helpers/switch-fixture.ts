import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
} from "three";
import {
  packageGeometryFixture,
  type FixturePart,
} from "./package-geometry-fixture";
import {
  clamshellSlots,
  fullArtwork,
  type ArtworkResource,
} from "../../src/lib/three/packaging-contracts";
import {
  modelSettings,
  type PackagingPresentation,
} from "../../src/lib/three/contracts";
// Original synthetic Switch-case study, with no retail dimensions, branding or game card.
export function switchFixture() {
  const dimensions = {
    schemaVersion: 1 as const,
    widthMm: 106,
    heightMm: 174,
    depthMm: 11,
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
      -0.048, 0.082, 0.0037, 0.048, 0.082, 0.0037, -0.048, -0.082, 0.0037,
      0.048, -0.082, 0.0037,
    ],
    [0, 0, 1],
  );
  art(
    "BACK",
    [
      0.048, 0.082, -0.0037, -0.048, 0.082, -0.0037, 0.048, -0.082, -0.0037,
      -0.048, -0.082, -0.0037,
    ],
    [0, 0, -1],
  );
  art(
    "SPINE",
    [
      -0.052, 0.082, -0.0045, -0.052, 0.082, 0.0045, -0.052, -0.082, -0.0045,
      -0.052, -0.082, 0.0045,
    ],
    [-1, 0, 0],
  );
  const add = (name: string, geometry: BufferGeometry, material = 3) =>
    parts.push({ name, geometry, material });
  const outline = new Shape(),
    x = 0.0518,
    y = 0.0858,
    r = 0.0035;
  outline.moveTo(-x + r, -y);
  outline.lineTo(x - r, -y);
  outline.quadraticCurveTo(x, -y, x, -y + r);
  outline.lineTo(x, y - r);
  outline.quadraticCurveTo(x, y, x - r, y);
  outline.lineTo(-x + r, y);
  outline.quadraticCurveTo(-x, y, -x, y - r);
  outline.lineTo(-x, -y + r);
  outline.quadraticCurveTo(-x, -y, -x + r, -y);
  for (const sign of [-1, 1]) {
    const face = new ExtrudeGeometry(outline, {
      depth: 0.0006,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 2,
      curveSegments: 5,
    });
    face.translate(0, 0, 0.0043);
    if (sign < 0) face.rotateY(Math.PI);
    add(sign > 0 ? "front-clear-shell" : "rear-clear-shell", face);
  }
  // Eight blended primitives total: bounded clear housing, without refraction.
  for (const sign of [-1, 1]) {
    add(
      `rim-${sign}`,
      new BoxGeometry(0.102, 0.0016, 0.01).translate(0, sign * 0.0862, 0),
    );
    add(
      `opening-lip-${sign}`,
      new BoxGeometry(0.0016, 0.074, 0.009).translate(0.0522, sign * 0.046, 0),
    );
  }
  add(
    "flexible-hinge",
    new BoxGeometry(0.0016, 0.17, 0.009).translate(-0.0515, 0, 0),
  );
  add("latch", new BoxGeometry(0.0012, 0.01, 0.006).translate(0.0524, 0, 0));
  // Empty card retainer only; no game card or owned-media inference.
  add(
    "empty-card-retainer-base",
    new BoxGeometry(0.026, 0.002, 0.001).translate(0.015, -0.036, -0.0027),
    4,
  );
  for (const sign of [-1, 1])
    add(
      `card-retainer-rail-${sign}`,
      new BoxGeometry(0.001, 0.028, 0.001).translate(
        0.015 + sign * 0.013,
        -0.022,
        -0.0027,
      ),
      4,
    );
  const materials = [
    ...parts.slice(0, 3).map((p) => ({
      name: `art:${p.name}`,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.65,
      },
    })),
    {
      name: "synthetic-switch-clear-plastic",
      alphaMode: "BLEND" as const,
      pbrMetallicRoughness: {
        baseColorFactor: [0.82, 0.88, 0.9, 0.18],
        metallicFactor: 0,
        roughnessFactor: 0.35,
      },
    },
    {
      name: "neutral-empty-card-retainer",
      pbrMetallicRoughness: {
        baseColorFactor: [0.65, 0.72, 0.74, 1],
        metallicFactor: 0,
        roughnessFactor: 0.65,
      },
    },
  ];
  const fixture = packageGeometryFixture(
    parts,
    materials,
    "GemuKore original synthetic Switch case",
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
        artWidthMm: i === 2 ? 9 : 96,
        artHeightMm: 164,
      },
    })),
  );
  return { dimensions, slots, ...fixture };
}
export function switchPresentation(fixture = switchFixture()) {
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2 as const,
    presentationKey: "synthetic-switch",
    title: "Synthetic Switch case",
    source: "Original synthetic test fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "package" }),
    content: {
      kind: "PACKAGING" as const,
      rendererVersion: "gltf-slots-v1" as const,
      familyKey: "switch-case" as const,
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
