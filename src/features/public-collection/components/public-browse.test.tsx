import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicBrowse } from "./public-browse";
import { parsePublicBrowse } from "../browsing";
import type { PublicCollection } from "../contracts";

const input = parsePublicBrowse({}, "games")!.input;
const data: PublicCollection = {
  filters: {},
  counts: { total: 21, games: 21, consoles: 0, accessories: 0, boxed: 0 },
  items: [
    {
      id: "one",
      type: "GAME",
      title: "A game",
      context: "First printing",
      href: "/collection/games/one",
      hasBox: null,
      identificationStatus: "CONFIRMED",
      photo: null,
    },
    {
      id: "two",
      type: "GAME",
      title: "A game",
      context: "First printing",
      href: "/collection/games/two",
      hasBox: false,
      identificationStatus: "INCOMPLETE",
      photo: null,
    },
  ],
  facets: [],
  facetsTruncated: false,
  offset: 0,
  limit: 20,
  hasMore: true,
};
it("restores native form values from the URL after clearing filters, including unsaved text", () => {
  const parsed = parsePublicBrowse(
    { q: "Chrono", hasBox: "unknown", sort: "newest" },
    "games",
  )!;
  const { rerender } = render(
    <PublicBrowse category="games" {...parsed} data={data} />,
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Unsaved edit" },
  });
  expect(screen.getByLabelText("Box", { exact: true })).toHaveValue("unknown");
  rerender(
    <PublicBrowse category="games" input={input} page={1} data={data} />,
  );
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByLabelText("Box", { exact: true })).toHaveValue("");
  expect(screen.getByLabelText("Sort by", { exact: true })).toHaveValue(
    "name-asc",
  );
});
it("server-renders separate physical copies, native GET controls and accurate paging without private media or unfinished detail links", () => {
  const html = renderToStaticMarkup(
    <PublicBrowse category="games" input={input} page={1} data={data} />,
  );
  expect(html).toContain('method="get"');
  expect(html).toContain('action="/collection/games"');
  expect(html).not.toContain("/api/media/private");
  expect(html).not.toContain('href="/collection/games/one"');
  expect(html).not.toContain("<canvas");
  render(<PublicBrowse category="games" input={input} page={1} data={data} />);
  expect(
    within(
      screen.getByRole("list", { name: "Collection objects" }),
    ).getAllByRole("listitem"),
  ).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Showing 1–2 of 21 objects",
  );
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/collection/games?page=2#objects",
  );
  expect(
    screen.queryByRole("link", { name: "Previous page" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Unresolved defects")).not.toBeInTheDocument();
});
it("offers only approved personal-field filters and safely retains selected options with no matches", () => {
  const parsed = parsePublicBrowse(
    { platform: "11111111-1111-4111-8111-111111111111", hasDefects: "false" },
    "games",
  )!;
  render(
    <PublicBrowse
      category="games"
      {...parsed}
      data={{
        ...data,
        filters: { location: true, hasDefects: true },
        facetsTruncated: true,
        items: [],
        counts: { ...data.counts, total: 0 },
        hasMore: false,
      }}
    />,
  );
  expect(screen.getByLabelText("Location")).toBeInTheDocument();
  expect(screen.getByLabelText("Unresolved defects")).toHaveValue("false");
  expect(
    screen.getByRole("heading", { name: "No objects match these filters" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Remove Platform: Selected option" }),
  ).toHaveAttribute("href", "/collection/games?hasDefects=false");
  expect(
    screen.getByText(/Some filter options are omitted/),
  ).toBeInTheDocument();
});
it("keeps deleted-page and empty-exhibit states honest and stops at the bounded page ceiling", () => {
  const { rerender } = render(
    <PublicBrowse
      category="games"
      input={input}
      page={2}
      data={{ ...data, items: [], offset: 20, hasMore: false }}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "There are no objects on this page" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "First page" })).toHaveAttribute(
    "href",
    "/collection/games",
  );
  rerender(
    <PublicBrowse
      category="games"
      input={input}
      page={1}
      data={{
        ...data,
        items: [],
        counts: { ...data.counts, total: 0 },
        hasMore: false,
      }}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "No objects on display yet" }),
  ).toBeVisible();
  rerender(
    <PublicBrowse
      category="games"
      input={{ ...input, offset: 5000 }}
      page={251}
      data={{ ...data, offset: 5000, counts: { ...data.counts, total: 6000 } }}
    />,
  );
  expect(
    screen.queryByRole("link", { name: "Next page" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/explore the remaining objects/)).toBeVisible();
});
