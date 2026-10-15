import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CollectionWorkspace } from "./collection-workspace";
import { requestCollectionSearch, requestFilteredSearch } from "../client";
import type { FilterOptions } from "../controls";
import type { SearchResult } from "../contracts";
const { url } = vi.hoisted(() => ({ url: { query: "" } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(url.query),
}));
vi.mock("../client", () => ({
  requestFilteredSearch: vi.fn(),
  requestCollectionSearch: vi.fn(),
}));
const request = vi.mocked(requestFilteredSearch);
const result: SearchResult = {
  state: "ready",
  items: [
    {
      id: "b41b30e9-0562-4896-9740-f9b742c102eb",
      type: "GAME",
      title: "Chrono Trigger",
      context: "SNES",
      identificationStatus: "CONFIRMED",
      matchSources: [],
      details: {
        releaseYear: 1995,
        location: "Home / Shelf",
        publisher: "Square",
        platform: "Super Nintendo",
      },
    },
  ],
  limit: 20,
  offset: 0,
  hasMore: false,
};
const options: FilterOptions = {
  platform: [{ value: "snes", label: "Super Nintendo" }],
  manufacturer: [],
  publisher: [],
  producer: [],
  model: [],
  region: [{ value: "japan", label: "Japan" }],
  year: [],
  location: [],
};
beforeEach(() => {
  url.query = "";
  request.mockReset().mockResolvedValue(result);
  vi.mocked(requestCollectionSearch).mockReset().mockResolvedValue(result);
});
it("restores URL filters and browses with empty text without leaking terms into URLs", async () => {
  url.query = "type=game&platform=snes&hasBox=unknown";
  render(<CollectionWorkspace options={options} />);
  await screen.findByRole("list", { name: "Search results" });
  expect(screen.getByLabelText("Item type")).toHaveValue("game");
  expect(request).toHaveBeenCalledWith("", expect.any(AbortSignal), {
    type: "game",
    platform: "snes",
    hasBox: "unknown",
    sort: "relevance",
  });
  expect(screen.getByText(/Home \/ Shelf/)).toBeVisible();
  expect(screen.queryByText(/^Matched:/)).not.toBeInTheDocument();
});
it("writes controls only into browser history, including removal and reset", () => {
  const history = vi.spyOn(window.history, "pushState");
  render(<CollectionWorkspace options={options} />);
  fireEvent.change(screen.getByLabelText("Item type"), {
    target: { value: "game" },
  });
  expect(history).toHaveBeenLastCalledWith(null, "", "/app/search?type=game");
  fireEvent.click(screen.getByRole("button", { name: "Browse all copies" }));
  expect(history).toHaveBeenLastCalledWith(
    null,
    "",
    "/app/search?sort=name-asc",
  );
  history.mockRestore();
});
it("rejects bad URL controls without displaying broad unfiltered results", () => {
  url.query = "platform=snes&platform=nes";
  render(<CollectionWorkspace options={options} />);
  expect(screen.getByRole("alert")).toHaveTextContent("invalid or unsupported");
  expect(request).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("list", { name: "Search results" }),
  ).not.toBeInTheDocument();
});
it("keeps an unavailable selected value instead of silently replacing it with Any", async () => {
  url.query = "platform=removed-platform";
  render(<CollectionWorkspace options={options} />);
  expect(screen.getByLabelText("Platform")).toHaveValue("removed-platform");
  expect(
    screen.getByRole("option", { name: "Selected value unavailable" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(request).toHaveBeenCalled());
});
it("cancels old scope requests and clears results immediately when controls change", async () => {
  let finish!: (result: SearchResult) => void;
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...result, items: [] });
  url.query = "type=game";
  const view = render(<CollectionWorkspace options={options} />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const signal = request.mock.calls[0][1];
  url.query = "type=console";
  view.rerender(<CollectionWorkspace options={options} />);
  expect(signal.aborted).toBe(true);
  await screen.findByRole("heading", { name: "No matching copies" });
  await act(async () => finish(result));
  expect(
    screen.queryByRole("heading", { name: "Chrono Trigger" }),
  ).not.toBeInTheDocument();
});
