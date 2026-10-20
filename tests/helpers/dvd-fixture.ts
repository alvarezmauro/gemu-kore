import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  TorusGeometry,
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
// Original synthetic DVD keep-case study, with no retail dimensions, branding or disc.
export function dvdFixture() {
  const dimensions = {
    schemaVersion: 1 as const,
    widthMm: 138,
    heightMm: 192,
    depthMm: 16,
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
      -0.064, 0.091, 0.0078, 0.064, 0.091, 0.0078, -0.064, -0.091, 0.0078,
      0.064, -0.091, 0.0078,
    ],
    [0, 0, 1],
  );
  art(
    "BACK",
    [
      0.064, 0.091, -0.0078, -0.064, 0.091, -0.0078, 0.064, -0.091, -0.0078,
      -0.064, -0.091, -0.0078,
    ],
    [0, 0, -1],
  );
  art(
    "SPINE",
    [
      -0.0692, 0.091, -0.007, -0.0692, 0.091, 0.007, -0.0692, -0.091, -0.007,
      -0.0692, -0.091, 0.007,
    ],
    [-1, 0, 0],
  );
  const add = (name: string, geometry: BufferGeometry) =>
    parts.push({ name, geometry, material: 3 });
  // Rounded face panels are separated by a seam; rim rails form hollow shell walls.
  const outline = new Shape(),
    x = 0.0678,
    y = 0.0948,
    r = 0.004;
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
      depth: 0.0008,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 2,
      curveSegments: 5,
    });
    face.translate(0, 0, 0.0064);
    if (sign < 0) face.rotateY(Math.PI);
    add(sign > 0 ? "front-shell" : "rear-shell", face);
    for (const edge of [-1, 1])
      add(
        `rim-${sign}-${edge}`,
        new BoxGeometry(0.13, 0.0016, 0.0058).translate(
          0,
          edge * 0.0952,
          sign * 0.0039,
        ),
      );
    // Distinct opening-edge lips leave a central seam and two latch gaps.
    for (const y of [-0.065, 0, 0.065])
      add(
        `opening-lip-${sign}-${y}`,
        new BoxGeometry(0.0016, 0.04, 0.0058).translate(
          0.0682,
          y,
          sign * 0.0039,
        ),
      );
  }
  add(
    "flexible-hinge",
    new BoxGeometry(0.002, 0.188, 0.014).translate(-0.0675, 0, 0),
  );
  for (const y of [-0.068, 0, 0.068])
    add(
      `hinge-rib-${y}`,
      new CylinderGeometry(0.0012, 0.0012, 0.036, 10).translate(-0.0678, y, 0),
    );
  for (const y of [-0.032, 0.032])
    add(
      `latch-${y}`,
      new BoxGeometry(0.0012, 0.01, 0.003).translate(0.0684, y, 0),
    );
  add(
    "empty-tray-ring",
    new TorusGeometry(0.053, 0.001, 6, 40).translate(0.003, 0, -0.0047),
  );
  add(
    "tray-hub",
    new CylinderGeometry(0.0055, 0.0055, 0.0012, 12)
      .rotateX(Math.PI / 2)
      .translate(0.003, 0, -0.004),
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
      name: "synthetic-dvd-plastic",
      pbrMetallicRoughness: {
        baseColorFactor: [0.025, 0.03, 0.04, 1],
        metallicFactor: 0,
        roughnessFactor: 0.6,
      },
    },
  ];
  const fixture = packageGeometryFixture(
    parts,
    materials,
    "GemuKore original synthetic DVD keep case",
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
        artWidthMm: i === 2 ? 14 : 128,
        artHeightMm: 182,
      },
    })),
  );
  return { dimensions, slots, ...fixture };
}
export function dvdPresentation(fixture = dvdFixture()) {
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2 as const,
    presentationKey: "synthetic-dvd",
    title: "Synthetic DVD case",
    source: "Original synthetic test fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "package" }),
    content: {
      kind: "PACKAGING" as const,
      rendererVersion: "gltf-slots-v1" as const,
      familyKey: "ps2-dvd" as const,
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
