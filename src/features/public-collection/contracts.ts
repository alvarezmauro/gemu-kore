export type PublicItemType = "CONSOLE" | "GAME" | "ACCESSORY";
export type PublicImage = {
  url: string;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  source: string;
};
export type PublicCard = {
  id: string;
  type: PublicItemType;
  title: string;
  context: string;
  href: string;
  hasBox: boolean | null;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
  photo: PublicImage | null;
};
type PublicCounts = {
  total: number;
  consoles: number;
  games: number;
  accessories: number;
  boxed: number;
};
export type PublicFacet = {
  field: "platform" | "region" | "company" | "year" | "location";
  value: string;
  label: string;
  count: number;
};
export type PublicCollection = {
  // Only advertise personal-field filters explicitly enabled in this snapshot.
  filters: { location?: true; hasDefects?: true };
  items: PublicCard[];
  counts: PublicCounts;
  facets: PublicFacet[];
  facetsTruncated: boolean;
  offset: number;
  limit: number;
  hasMore: boolean;
};
export type PublicDetail = PublicCard & {
  gallery?: { images: PublicImage[]; hasMore: boolean };
  model?: boolean;
  components?: { id: string; name: string }[];
  description: string | null;
  facts: { label: string; value: string }[];
  markets: string[];
  relatedTruncated: boolean;
  serialNumber?: string | null;
  notes?: string | null;
  location?: { name: string; type: string; breadcrumb: string[] } | null;
  defects?: {
    items: {
      title: string;
      description: string | null;
      severity: string;
      status: string;
    }[];
    hasMore: boolean;
  };
};
export type PublicHome =
  | { state: "private"; message: "This collection is currently private." }
  | {
      state: "public";
      name: string;
      description: string | null;
      counts: PublicCounts;
      recent: PublicCard[];
    };
