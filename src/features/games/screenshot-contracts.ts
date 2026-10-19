export type Screenshot = {
  id: string;
  caption: string | null;
  altText: string | null;
  url: string;
  width: number;
  height: number;
  source: {
    type: string;
    provider: string | null;
    url: string | null;
    author: string | null;
    licenseName: string | null;
    licenseUrl: string | null;
    attribution: string | null;
    restrictions: string | null;
    retrievedAt: string | null;
  };
};
export type ScreenshotGalleryData = {
  items: Screenshot[];
  page: number;
  hasNext: boolean;
  scope: "release" | "game";
  canManage: boolean;
};
