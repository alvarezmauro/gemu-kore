import { randomUUID } from "node:crypto";
import { boxFaces, fullArtwork } from "../../src/lib/three/packaging-contracts";
import {
  modelSettings,
  type PackagingPresentation,
} from "../../src/lib/three/contracts";
export function packagingFixture(): PackagingPresentation {
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
      componentId: randomUUID(),
      templateId: randomUUID(),
      templateRevision: 2,
      synthetic: true,
      dimensions: {
        schemaVersion: 1,
        widthMm: 180,
        heightMm: 125,
        depthMm: 30,
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
