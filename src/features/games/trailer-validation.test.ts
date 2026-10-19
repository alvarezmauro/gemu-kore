import { expect, it } from "vitest";
import {
  parseTrailerInput,
  storedTrailer,
  trailerLinks,
  trailerMutation,
} from "./trailer-validation";
const id = "AbCdEf123_-";
it.each([
  id,
  `https://www.youtube.com/watch?v=${id}&t=12`,
  `https://youtu.be/${id}?si=ignored`,
  `https://m.youtube.com/shorts/${id}`,
  `https://www.youtube-nocookie.com/embed/${id}`,
])("extracts only a structured video ID from %s", (value) => {
  const parsed = parseTrailerInput("YOUTUBE", value);
  expect(parsed).toEqual({ provider: "YOUTUBE", id });
  expect(trailerLinks(parsed).embed).toBe(
    `https://www.youtube-nocookie.com/embed/${id}?playsinline=1`,
  );
});
it.each([
  "<iframe src='https://youtube.com/embed/AbCdEf123_-'></iframe>",
  "javascript:alert(1)",
  `https://youtube.com.evil.test/watch?v=${id}`,
  `https://youtube.com@evil.test/watch?v=${id}`,
  `http://youtube.com/watch?v=${id}`,
  `https://www.youtube.com/playlist?list=${id}`,
  "too-short",
  `https://youtu.be/${id}/extra`,
  `https://www.youtube.com/watch?v=${id}%22`,
])("rejects unsupported YouTube input %s", (value) => {
  expect(() => parseTrailerInput("YOUTUBE", value)).toThrow();
});
it("normalizes HTTPS direct references and rejects executable/credential/mixed provider input", () => {
  expect(
    parseTrailerInput(
      "DIRECT_URL",
      "https://EXAMPLE.com/video.mp4?token=abc#fragment",
    ),
  ).toEqual({
    provider: "DIRECT_URL",
    url: "https://example.com/video.mp4?token=abc",
  });
  for (const value of [
    "data:video/mp4;base64,AAA",
    "//example.com/video",
    "http://example.com/video",
    "https://user:pass@example.com/video",
    '<iframe src="https://example.com/video">',
    "file:///video.mp4",
  ])
    expect(() => parseTrailerInput("DIRECT_URL", value)).toThrow();
  expect(
    storedTrailer({
      trailerProvider: "YOUTUBE",
      trailerId: "<bad>",
      trailerUrl: null,
    }),
  ).toBeNull();
  expect(
    trailerMutation.safeParse({
      kind: "game",
      id: "981e6d4d-a8a3-46bb-b9eb-2a697b2b08a7",
      expectedRevision: 1,
      trailer: { provider: "YOUTUBE", id, url: "https://example.com/" },
    }).success,
  ).toBe(false);
});
