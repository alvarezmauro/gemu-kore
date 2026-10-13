export const photoTypes = [
  "PHOTO",
  "FRONT",
  "BACK",
  "LEFT",
  "RIGHT",
  "TOP",
  "BOTTOM",
  "SERIAL",
  "BOX",
  "DAMAGE",
  "OTHER",
] as const;
export type PhotoType = (typeof photoTypes)[number];
export const photoLabels: Record<PhotoType, string> = {
  PHOTO: "Photo",
  FRONT: "Front",
  BACK: "Back",
  LEFT: "Left",
  RIGHT: "Right",
  TOP: "Top",
  BOTTOM: "Bottom",
  SERIAL: "Serial number",
  BOX: "Box",
  DAMAGE: "Damage",
  OTHER: "Other",
};
export type MediaItem = { id: string; label: string; revision: number };
export type Photo = {
  id: string;
  type: PhotoType;
  caption: string | null;
  altText: string | null;
  displayUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  publicApproved: boolean;
};
export type MediaActionResult = {
  status: "success" | "error";
  message: string;
};
export const photoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export const photoSizeLimit = 25 * 1024 * 1024;
export function movePhoto(
  ids: readonly string[],
  id: string,
  to: number,
): string[] {
  const from = ids.indexOf(id);
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, id);
  return result;
}
