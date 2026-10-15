import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CollectionResults } from "./collection-results";
import type { SearchHit } from "@/features/search/contracts";
const item: SearchHit = {
  id: "b41b30e9-0562-4896-9740-f9b742c102eb",
  type: "GAME",
  title: "Chrono Trigger",
  context: "SNES · Original",
  identificationStatus: "INCOMPLETE",
  matchSources: [],
  details: {
    releaseYear: null,
    location: null,
    platform: "SNES",
    publisher: "Square",
  },
  card: { hasBox: null, unresolvedDefects: 0, producer: null, photo: null },
};
it("keeps two copies separate with honest missing observations and copy actions in either view", () => {
  const items = [item, { ...item, id: "c41b30e9-0562-4896-9740-f9b742c102eb" }];
  const view = render(
    <CollectionResults items={items} view="grid" choose={vi.fn()} />,
  );
  expect(screen.getAllByText("No photo yet")).toHaveLength(2);
  expect(screen.getAllByText("Box status unknown")).toHaveLength(2);
  expect(screen.getAllByText("No unresolved defects recorded")).toHaveLength(2);
  expect(screen.getAllByText("Identity incomplete")).toHaveLength(2);
  expect(screen.getAllByText(/Year unknown/)).toHaveLength(2);
  for (const copy of items)
    expect(
      screen.getByRole("link", {
        name: `Photos for Chrono Trigger, copy ${copy.id.slice(0, 8)}`,
      }),
    ).toHaveAttribute("href", `/app/media?itemId=${copy.id}`);
  view.rerender(
    <CollectionResults items={items} view="list" choose={vi.fn()} />,
  );
  expect(
    within(screen.getByRole("list", { name: "Search results" })).getAllByRole(
      "listitem",
    ),
  ).toHaveLength(2);
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
it("uses only private image delivery and replaces a broken photo without changing identity", () => {
  const photo = {
    assetId: "d41b30e9-0562-4896-9740-f9b742c102eb",
    altText: "My boxed copy",
    width: 100,
    height: 200,
  };
  render(
    <CollectionResults
      items={[{ ...item, card: { ...item.card!, photo } }]}
      view="grid"
      choose={vi.fn()}
    />,
  );
  const image = screen.getByRole("img", { name: "My boxed copy" });
  expect(new URL(image.getAttribute("src")!, "http://localhost").pathname).toBe(
    `/api/media/private/${photo.assetId}`,
  );
  expect(image).toHaveAttribute("loading", "lazy");
  fireEvent.error(image);
  expect(screen.getByText("Photo unavailable")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
});
it("provides labeled toggle buttons without making the entire card a nested navigation target", () => {
  const choose = vi.fn();
  render(<CollectionResults items={[item]} view="grid" choose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  expect(choose).toHaveBeenCalledWith("list");
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
