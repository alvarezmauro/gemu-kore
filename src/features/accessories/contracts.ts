import type {
  CatalogOption,
  ReferenceInput,
} from "@/features/catalog/contracts";
import type { AccessoryFields, VariantFields } from "./validation";
export const accessoryFieldLabels: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  producerId: "Producer",
  releaseYear: "Release year",
  description: "Description",
  specifications: "Specifications",
  trailer: "Video",
  accessoryId: "Accessory family",
  modelNumber: "Model number",
  color: "Color",
  edition: "Edition",
  descriptionOverride: "Variant description",
  specificationsOverride: "Variant specifications",
  regionLock: "Region locking",
  regionLockNote: "Region lock notes",
  identificationStatus: "Identification",
  regionIds: "Commercial markets",
  platforms: "Compatible platforms",
  references: "External references",
  archivedAt: "Archive status",
};
export type AccessoryCatalogRecord = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
  options: {
    company: CatalogOption[];
    accessory: CatalogOption[];
    platform: CatalogOption[];
    region: CatalogOption[];
  };
  references: ReferenceInput[];
} & (
  | { kind: "accessory"; fields: AccessoryFields }
  | { kind: "variant"; fields: VariantFields }
);
