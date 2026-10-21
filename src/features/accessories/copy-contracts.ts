import type {
  ConsoleChoices,
  ConsoleResult,
  ConsoleLocation,
  ConsoleCopyFields,
} from "@/features/consoles/contracts";
export type Choices<T> = ConsoleChoices<T>;
export type Result<T> = ConsoleResult<T>;
export type CopyLocation = ConsoleLocation;
export type AccessoryChoice = {
  id: string;
  name: string;
  slug: string;
  revision: number;
  archived: boolean;
  producer: string | null;
  year: number | null;
};
export type VariantChoice = {
  id: string;
  name: string;
  slug: string;
  revision: number;
  archived: boolean;
  accessoryId: string;
  modelNumber: string | null;
  color: string | null;
  edition: string | null;
  producer: string | null;
  year: number | null;
  identificationStatus: string;
  markets: { id: string; name: string }[];
  platforms: {
    id: string;
    name: string;
    archived: boolean;
    note: string | null;
  }[];
};
export type AccessoryModel = {
  id: string;
  name: string;
  primary: boolean;
  url: string;
};
export type AccessoryCopyDetail = {
  id: string;
  revision: number;
  publicationStatus: "PRIVATE" | "PUBLISHED";
  fields: ConsoleCopyFields;
  location: string | null;
  accessory: AccessoryChoice;
  variant: VariantChoice;
  defects: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    status: string;
  }[];
  defectCount: number;
};
