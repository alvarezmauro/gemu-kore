import { randomUUID } from "node:crypto";
import {
  boxFaces,
  fullArtwork,
  type BoxFamily,
} from "../../src/lib/three/packaging-contracts";
import {
  modelSettings,
  type PackagingPresentation,
} from "../../src/lib/three/contracts";
export function packagingFixture(
  familyKey: BoxFamily = "snes-cardboard",
): PackagingPresentation {
  return {
    schemaVersion: 2,
    presentationKey: "synthetic-box",
    title: "Synthetic box",
    source: "Synthetic fixture",
    description: "Not retail measurements",
    poster: null,
    settings: modelSettings.parse({ preset: "package" }),
    content: {
      kind: "PACKAGING",
      rendererVersion: "box-v1",
      familyKey,
      componentId: randomUUID(),
      templateId: randomUUID(),
      templateRevision: 2,
      synthetic: true,
      dimensions: {
        schemaVersion: 1,
        widthMm: familyKey === "nes-cardboard" ? 110 : 180,
        heightMm: familyKey === "nes-cardboard" ? 160 : 125,
        depthMm: familyKey === "nes-cardboard" ? 25 : 30,
      },
      slots: boxFaces.map((f) => ({
        face: f.face,
        name: f.name,
        required: f.required,
        resource: null,
        transform: fullArtwork,
      })),
      artworkComplete: false,
    },
  };
}
