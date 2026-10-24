export const searchTypes = ["CONSOLE", "GAME", "ACCESSORY"] as const;
type SearchType = (typeof searchTypes)[number];
export const matchSources = [
  "Identity",
  "Platform",
  "Company",
  "Edition",
  "Region",
  "Identifier",
  "Serial number",
  "Note",
  "Defect",
  "Repair note",
] as const;
type MatchSource = (typeof matchSources)[number];
export type SearchHit = {
  id: string;
  type: SearchType;
  title: string;
  context: string;
  identificationStatus: "INCOMPLETE" | "CONFIRMED";
  matchSources: MatchSource[];
  details?: {
    releaseYear: number | null;
    location: string | null;
    platform: string | null;
    publisher: string | null;
  };
  card?: {
    hasBox: boolean | null;
    unresolvedDefects: number;
    producer: string | null;
    photo: {
      assetId: string;
      altText: string | null;
      width: number;
      height: number;
    } | null;
  };
};
export type SearchResult = {
  state: "idle" | "ready";
  items: SearchHit[];
  hasMore: boolean;
  offset: number;
  limit: number;
};
