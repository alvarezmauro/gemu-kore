export type PublicItemType = "CONSOLE" | "GAME" | "ACCESSORY";
export type PublicCard = {
  id: string;
  type: PublicItemType;
  title: string;
  context: string;
  href: string;
  hasBox: boolean | null;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
  // Public delivery is introduced in 18.5. Never substitute a private URL.
  photo: null;
};
export type PublicCounts = {
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
  items: PublicCard[];
  counts: PublicCounts;
  facets: PublicFacet[];
  facetsTruncated: boolean;
  offset: number;
  limit: number;
  hasMore: boolean;
};
export type PublicDetail = PublicCard & {
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
