import type { AssetAttribution } from "@/features/provenance/contracts";
import type {
  PackagingFamily,
  GlbSlotTarget,
  TextureTransform,
} from "@/lib/three/packaging-contracts";
export type BoxTemplate = {
  id: string;
  name: string;
  slug: string;
  familyKey: PackagingFamily;
  geometryType: "PROCEDURAL_BOX" | "GLB";
  baseModel: {
    id: string;
    url: string;
    mimeType: "model/gltf-binary";
    byteLength: number;
  } | null;
  modelSource: AssetAttribution | null;
  revisionNumber: number;
  revision: number;
  status: "DRAFT" | "READY";
  archived: boolean;
  dimensions: {
    schemaVersion: 1;
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  synthetic: boolean;
  measurementNote: string;
  slots: {
    id: string;
    name: string;
    face: number | null;
    target: GlbSlotTarget | null;
    required: boolean;
  }[];
};
export type PackagingComponent = {
  id: string;
  name: string;
  quantity: number;
  templateName: string | null;
  familyKey: PackagingFamily | null;
  synthetic: boolean;
  available: boolean;
  artworkComplete: boolean;
  notice: string;
};
export type PackagingManager = {
  release: { id: string; name: string; revision: number; archived: boolean };
  templates: BoxTemplate[];
  moreTemplates: boolean;
  moreArtwork: boolean;
  components: {
    id: string;
    name: string;
    templateId: string | null;
    bindings: {
      slotId: string;
      assetId: string;
      transform: TextureTransform;
    }[];
  }[];
  artwork: {
    id: string;
    label: string;
    url: string;
    width: number;
    height: number;
    source: AssetAttribution;
  }[];
};
