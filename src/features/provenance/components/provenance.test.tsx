import { render, screen, fireEvent, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MetadataSource } from "./metadata-source";
import { AssetSource } from "./asset-source";
import { GameSources } from "./game-sources";
import type { MetadataAttribution } from "../contracts";
const attribution: MetadataAttribution = {
  origin: "PROVIDER",
  recordedAt: "2026-10-19T12:01:00.000Z",
  source: {
    name: "IGDB",
    retrievedAt: "2026-10-19T12:00:00.000Z",
    updatedAt: [],
    urls: ["https://www.igdb.com/games/orbit-quest"],
    scope: "Game-level evidence",
    transformations: ["Sourced entries added while retaining existing values."],
    confidence: null,
  },
  note: null,
};
it("shows imported sources without guessing confidence and keeps external links private", () => {
  render(<MetadataSource attribution={attribution} />);
  expect(screen.getByText("Imported metadata")).toBeVisible();
  expect(screen.getByText("Confidence: Not provided")).toBeVisible();
  expect(screen.getByRole("link", { name: /Source page/ })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
});
it("separates game and release attribution and explains missing origins without inventing sources", () => {
  render(
    <GameSources
      provenance={{
        game: [
          { ...attribution, label: "Title", field: "name", hasValue: true },
        ],
        release: [
          {
            origin: "UNKNOWN",
            recordedAt: null,
            source: null,
            note: "Source not recorded.",
            field: "descriptionOverride",
            label: "Release description",
            hasValue: false,
          },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByText("Game sources", { exact: true }));
  fireEvent.click(screen.getByText("Release sources", { exact: true }));
  const section = screen.getByRole("region", { name: "Metadata sources" });
  expect(within(section).getByText("Source unknown")).toBeVisible();
  expect(within(section).getByText("No current value recorded.")).toBeVisible();
});
it("preserves media credit and restrictions as text while treating missing license as unknown", () => {
  render(
    <AssetSource
      source={{
        type: "CURATED",
        provider: "Archive",
        url: null,
        author: "<script>untrusted</script>",
        licenseName: null,
        licenseUrl: null,
        attribution: "Archive credit",
        restrictions: "Private use only",
        retrievedAt: null,
      }}
    />,
  );
  expect(screen.getByText("License: Not recorded")).toBeVisible();
  expect(
    screen.getByText("Usage restrictions: Private use only"),
  ).toBeVisible();
  expect(document.querySelector("script")).toBeNull();
  expect(
    screen.getByText(
      "Source information does not grant permission to publish this image.",
    ),
  ).toBeVisible();
});
