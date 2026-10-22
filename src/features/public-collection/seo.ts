import type { PublicItemType } from "./contracts";
export const publicCategoryPaths: Record<PublicItemType, string> = {
  CONSOLE: "consoles",
  GAME: "games",
  ACCESSORY: "accessories",
};
export const publicSeoFallback = {
  index: false,
  title: "The collection | GemuKore",
  description: "A home for physical video games, consoles and accessories.",
} as const;
export type PublicSeo = {
  index: boolean;
  title: string;
  description: string;
  canonical?: string;
  image?: { url: string; width: number; height: number; alt: string };
};
export function seoText(value: string, max: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
