import {
  parseControls,
  controlsQuery,
  type CollectionControls,
} from "@/features/search/controls";

export const pageSize = 20;
export const lastPage = 251; // Existing service offset ceiling: 5,000.
export type CollectionView = "grid" | "list";
export function parseBrowseLocation(params: URLSearchParams) {
  if (params.toString().length > 2048 || params.getAll("page").length > 1)
    return null;
  const rawPage = params.get("page");
  if (rawPage !== null && !/^[1-9]\d{0,2}$/.test(rawPage)) return null;
  const page = rawPage === null ? 1 : Number(rawPage);
  if (page > lastPage) return null;
  const rest = new URLSearchParams(params);
  rest.delete("page");
  const parsed = parseControls(rest);
  return parsed.success ? { controls: parsed.data, page } : null;
}
export function browseQuery(controls: CollectionControls, page: number) {
  const params = new URLSearchParams(controlsQuery(controls));
  if (page > 1) params.set("page", String(page));
  return params.toString();
}
