import type { AssetAttribution } from "@/features/provenance/contracts";
import type {
  GlbSlotTarget,
  TextureTransform,
} from "@/lib/three/packaging-contracts";
export type CartridgeTemplate = {
  id: string;
  name: string;
  slug: string;
  familyKey: "cartridge";
  geometryType: "GLB";
  type: "CARTRIDGE";
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
    face: null;
    target: GlbSlotTarget | null;
    required: boolean;
  }[];
};
export type MediaComponent = {
  media: true;
  id: string;
  name: string;
  quantity: number;
  templateName: string | null;
  familyKey: "cartridge" | null;
  synthetic: boolean;
  available: boolean;
  artworkComplete: boolean;
  notice: string;
};
export type MediaManager = {
  release: { id: string; name: string; revision: number; archived: boolean };
  templates: CartridgeTemplate[];
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
