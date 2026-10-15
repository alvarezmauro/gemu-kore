export const searchTypes = ["CONSOLE", "GAME", "ACCESSORY"] as const;
export type SearchType = (typeof searchTypes)[number];
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
export type MatchSource = (typeof matchSources)[number];
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
};
export type SearchResult = {
  state: "idle" | "ready";
  items: SearchHit[];
  hasMore: boolean;
  offset: number;
  limit: number;
};
export type SearchInput = { q: string; limit: number; offset: number };
