import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PlaytimeSummary } from "./playtime-summary";
it("shows zero, unknown and source metadata distinctly", () => {
  render(
    <PlaytimeSummary
      estimates={{
        mainMinutes: 0,
        mainExtrasMinutes: null,
        completionistMinutes: 181,
        sourceType: "MANUAL",
        sourceName: "My estimate",
        sourceUrl: "https://example.com/source",
        observedAt: "2024-02-29T00:00:00.000Z",
        updatedAt: "2026-10-19T00:00:00.000Z",
      }}
    />,
  );
  expect(screen.getByText("0 min")).toBeVisible();
  expect(screen.getByText("Unknown")).toBeVisible();
  expect(screen.getByText("3 hr 1 min")).toBeVisible();
  expect(screen.getByText("Manual estimate · My estimate")).toBeVisible();
  expect(screen.getByRole("link", { name: "Playtime source" })).toHaveAttribute(
    "href",
    "https://example.com/source",
  );
  expect(screen.getByText("2024-02-29")).toHaveAttribute(
    "datetime",
    "2024-02-29T00:00:00.000Z",
  );
});
it("labels external estimates and useful empty states", () => {
  const view = render(<PlaytimeSummary estimates={null} />);
  expect(screen.getByText("No playtime estimates recorded.")).toBeVisible();
  view.rerender(
    <PlaytimeSummary
      estimates={{
        mainMinutes: null,
        mainExtrasMinutes: null,
        completionistMinutes: null,
        sourceType: "PROVIDER",
        sourceName: "Curated archive",
        sourceUrl: null,
        observedAt: "2024-02-29T00:00:00.000Z",
      }}
    />,
  );
  expect(
    screen.getByText("External source estimate · Curated archive"),
  ).toBeVisible();
  expect(screen.getAllByText("Unknown")).toHaveLength(3);
});
