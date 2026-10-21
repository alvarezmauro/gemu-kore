import type { PublicDetail } from "./contracts";
import type { PublicSettingsValues } from "./validation";

export type PublicationSettings = PublicSettingsValues & { revision: number };
export type SettingsReview = {
  affectedCopies: number;
  site: { collectionName: string; collectionDescription: string | null } | null;
  reviewToken: string;
};
export type ItemReview = {
  preview: "public-projection";
  item: PublicDetail;
  revision: number;
  settingsRevision: number;
  published: boolean;
  reviewToken: string;
};
export type PublicationResult<T> =
  { status: "success"; data: T } | { status: "error"; message: string };
