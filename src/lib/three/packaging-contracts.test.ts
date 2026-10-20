import { expect, it } from "vitest";
import {
  artworkLayout,
  fullArtwork,
  textureTransform,
} from "./packaging-contracts";
import { packagingPresentation } from "./contracts";
import { packagingFixture } from "../../../tests/helpers/packaging-fixture";
it("contains cropped quarter-turned artwork without stretching or enlargement", () => {
  const result = artworkLayout(600, 400, 180, 125, {
    ...fullArtwork,
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    quarterTurns: 1,
  });
  expect(result).toMatchObject({
    sourceX: 150,
    sourceY: 100,
    sourceWidth: 300,
    sourceHeight: 200,
    outputWidth: 300,
    outputHeight: 208,
  });
  expect(result.drawWidth / result.drawHeight).toBeCloseTo(2 / 3);
  expect(result.drawHeight).toBeLessThanOrEqual(300);
  expect(() =>
    artworkLayout(100, 100, 180, 125, {
      ...fullArtwork,
      crop: { x: 0, y: 0, width: 0.001, height: 1 },
    }),
  ).toThrow();
  expect(
    textureTransform.safeParse({
      ...fullArtwork,
      crop: { x: 0.5, y: 0, width: 0.8, height: 1 },
    }).success,
  ).toBe(false);
});
it("rejects invalid face contracts, misleading completeness, foreign URLs and conflicting resources", () => {
  const p = packagingFixture();
  expect(packagingPresentation.safeParse(p).success).toBe(true);
  p.content.artworkComplete = true;
  expect(packagingPresentation.safeParse(p).success).toBe(false);
  p.content.artworkComplete = false;
  p.content.slots[1].face = 0;
  expect(packagingPresentation.safeParse(p).success).toBe(false);
  const a = packagingFixture(),
    id = crypto.randomUUID(),
    r = {
      id,
      url: `/api/media/private/${id}`,
      mimeType: "image/png" as const,
      byteLength: 50,
      width: 100,
      height: 100,
    };
  a.content.slots[0].resource = r;
  a.content.slots[1].resource = { ...r, width: 101 };
  expect(packagingPresentation.safeParse(a).success).toBe(false);
  a.content.slots[1].resource = null;
  a.content.slots[0].resource = {
    ...r,
    url: "https://other.example/image.png",
  };
  expect(packagingPresentation.safeParse(a).success).toBe(false);
});
