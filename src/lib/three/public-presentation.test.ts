import { expect, it } from "vitest";
import { modelSettings, publicViewerPresentation } from "./contracts";
const item = "11111111-1111-4111-8111-111111111111",
  use = "22222222-2222-4222-8222-222222222222";
const presentation = {
  schemaVersion: 1,
  presentationKey: "public",
  title: "Collection object",
  source: "Catalog model",
  description: "Approved artwork",
  resource: {
    id: use,
    url: `/api/media/public/items/${item}/catalog/${use}`,
    mimeType: "model/gltf-binary",
    byteLength: 100,
  },
  poster: null,
  settings: modelSettings.parse({}),
};
it("accepts contextual public resources while rejecting private, arbitrary and cross-copy URLs at the public viewer boundary", () => {
  expect(publicViewerPresentation.safeParse(presentation).success).toBe(true);
  for (const url of [
    `/api/media/private/${use}`,
    `/api/media/public/assets/${use}`,
    "https://example.com/file.glb",
    `${presentation.resource.url}?asset=original`,
  ])
    expect(
      publicViewerPresentation.safeParse({
        ...presentation,
        resource: { ...presentation.resource, url },
      }).success,
    ).toBe(false);
  expect(
    publicViewerPresentation.safeParse({
      ...presentation,
      poster: {
        url: `/api/media/public/items/${use}/catalog/${item}`,
        alt: "Other copy",
        width: 80,
        height: 60,
      },
    }).success,
  ).toBe(false);
});
