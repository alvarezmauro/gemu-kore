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
import { cartridgeSlots } from "../../src/lib/three/media-contracts";
import {
  fullArtwork,
  type ArtworkResource,
} from "../../src/lib/three/packaging-contracts";
import {
  modelSettings,
  type CartridgePresentation,
} from "../../src/lib/three/contracts";
// Original synthetic stepped cartridge, not a retail model or measurement source.
export function cartridgeFixture() {
  const dimensions = {
    schemaVersion: 1 as const,
    widthMm: 104,
    heightMm: 72,
    depthMm: 19,
  };
  const parts: FixturePart[] = [];
  const label = new BufferGeometry();
  label.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        -0.038, 0.026, 0.0097, 0.038, 0.026, 0.0097, -0.038, -0.012, 0.0097,
        0.038, -0.012, 0.0097,
      ],
      3,
    ),
  );
  label.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
  );
  label.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2),
  );
  label.setIndex([0, 2, 1, 1, 2, 3]);
  parts.push({ name: "FRONT_LABEL", geometry: label, material: 0 });
  const outline = new Shape();
  outline.moveTo(-0.0515, -0.0355);
  outline.lineTo(-0.0515, 0.018);
  outline.lineTo(-0.044, 0.018);
  outline.lineTo(-0.044, 0.0355);
  outline.lineTo(0.044, 0.0355);
  outline.lineTo(0.044, 0.018);
  outline.lineTo(0.0515, 0.018);
  outline.lineTo(0.0515, -0.0355);
  outline.lineTo(0.034, -0.0355);
  outline.lineTo(0.034, -0.027);
  outline.lineTo(-0.034, -0.027);
  outline.lineTo(-0.034, -0.0355);
  outline.closePath();
  parts.push({
    name: "stepped-shell",
    material: 1,
    geometry: new ExtrudeGeometry(outline, {
      depth: 0.018,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.0005,
      bevelSize: 0.0005,
      bevelSegments: 2,
    }).translate(0, 0, -0.009),
  });
  for (const sign of [-1, 1])
    for (let i = 0; i < 4; i++)
      parts.push({
        name: `grip-${sign}-${i}`,
        material: 2,
        geometry: new BoxGeometry(0.007, 0.0018, 0.001).translate(
          sign * 0.047,
          -0.005 - i * 0.006,
          0.009,
        ),
      });
  parts.push({
    name: "recessed-connector",
    material: 2,
    geometry: new BoxGeometry(0.066, 0.006, 0.009).translate(0, -0.03, 0),
  });
  for (let i = 0; i < 10; i++)
    parts.push({
      name: `contact-${i}`,
      material: 3,
      geometry: new BoxGeometry(0.003, 0.004, 0.0003).translate(
        -0.027 + i * 0.006,
        -0.03,
        0.0047,
      ),
    });
  const materials = [
    {
      name: "art:FRONT_LABEL",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.65,
      },
    },
    {
      name: "synthetic-cartridge-plastic",
      pbrMetallicRoughness: {
        baseColorFactor: [0.26, 0.28, 0.3, 1],
        metallicFactor: 0,
        roughnessFactor: 0.7,
      },
    },
    {
      name: "grip-and-connector",
      pbrMetallicRoughness: {
        baseColorFactor: [0.08, 0.09, 0.1, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    },
    {
      name: "synthetic-contacts",
      pbrMetallicRoughness: {
        baseColorFactor: [0.48, 0.32, 0.12, 1],
        metallicFactor: 0.6,
        roughnessFactor: 0.5,
      },
    },
  ];
  const fixture = packageGeometryFixture(
    parts,
    materials,
    "GemuKore original synthetic cartridge",
  );
  const slots = cartridgeSlots.parse([
    {
      name: "FRONT_LABEL",
      target: {
        schemaVersion: 1,
        kind: "GLB_PRIMITIVE",
        sceneIndex: 0,
        nodeIndex: 0,
        meshIndex: 0,
        primitiveIndex: 0,
        materialIndex: 0,
        uvChannel: 0,
        nodeName: "FRONT_LABEL",
        materialName: "art:FRONT_LABEL",
        artWidthMm: 76,
        artHeightMm: 38,
      },
    },
  ]);
  return { dimensions, slots, ...fixture };
}
export function cartridgeStudy(
  fixture = cartridgeFixture(),
): CartridgePresentation {
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2,
    presentationKey: "synthetic-cartridge",
    title: "Synthetic cartridge",
    source: "Original synthetic fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "cartridge" }),
    content: {
      kind: "PHYSICAL_MEDIA",
      rendererVersion: "cartridge-v1",
      familyKey: "cartridge",
      type: "CARTRIDGE",
      componentId: crypto.randomUUID(),
      templateId: crypto.randomUUID(),
      templateRevision: 3,
      synthetic: true,
      dimensions: fixture.dimensions,
      geometry: {
        id,
        url: `/api/media/private/${id}`,
        mimeType: "model/gltf-binary",
        byteLength: fixture.bytes.length,
      },
      slots: fixture.slots.map((s) => ({
        ...s,
        required: true,
        resource: null as ArtworkResource | null,
        transform: fullArtwork,
      })),
      artworkComplete: false,
    },
  };
}
