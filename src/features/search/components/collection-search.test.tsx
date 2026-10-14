import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { requestCollectionSearch } from "../client";
import type { SearchResult } from "../contracts";
import { CollectionSearch } from "./collection-search";
vi.mock("../client", () => ({ requestCollectionSearch: vi.fn() }));
const request = vi.mocked(requestCollectionSearch);
const result: SearchResult = {
  state: "ready",
  items: [
    {
      id: "b41b30e9-0562-4896-9740-f9b742c102eb",
      type: "GAME",
      title: "Chrono Trigger",
      context: "SNES · Original",
      identificationStatus: "CONFIRMED",
      matchSources: ["Identity"],
    },
  ],
  hasMore: false,
  offset: 0,
  limit: 20,
};
beforeEach(() => {
  request.mockReset();
});
it("starts idle and does not send single-character terms", async () => {
  render(<CollectionSearch />);
  expect(
    screen.getByRole("heading", { name: "Find a physical copy" }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "c" },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(request).not.toHaveBeenCalled();
});
it("renders narrow results with existing copy-scoped photo/defect actions", async () => {
  request.mockResolvedValue(result);
  render(<CollectionSearch />);
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "chrono" },
  });
  await screen.findByRole("list", { name: "Search results" });
  expect(screen.getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
  expect(screen.getByRole("link", { name: /Photos for/ })).toHaveAttribute(
    "href",
    `/app/media?itemId=${result.items[0].id}`,
  );
  expect(screen.getByText("Matched: Identity")).toBeVisible();
});
it("cancels and ignores an obsolete response when the query changes", async () => {
  let finish!: (value: SearchResult) => void;
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...result, items: [] });
  render(<CollectionSearch />);
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "chrono" },
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const signal = request.mock.calls[0][1];
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "missing" },
  });
  expect(signal.aborted).toBe(true);
  await screen.findByRole("heading", { name: "No matching copies" });
  await act(async () => finish(result));
  expect(
    screen.queryByRole("heading", { name: "Chrono Trigger" }),
  ).not.toBeInTheDocument();
});
it("retains input after an error and retries explicitly", async () => {
  request
    .mockRejectedValueOnce(new Error("Search is unavailable."))
    .mockResolvedValueOnce(result);
  render(<CollectionSearch />);
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "chrono" },
  });
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Search your collection")).toHaveValue("chrono");
  fireEvent.click(screen.getByRole("button", { name: "Try search again" }));
  await screen.findByRole("list", { name: "Search results" });
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not retry malformed client input into a permanent loading state", () => {
  render(<CollectionSearch />);
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "one two three four five six seven eight nine" },
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("Search your collection")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Search your collection")).toHaveAttribute(
    "aria-describedby",
    "search-help search-error",
  );
  expect(
    screen.getByRole("button", { name: "Try search again" }),
  ).toBeDisabled();
});
it("labels incomplete identity and bounded results without implementing future paging controls", async () => {
  request.mockResolvedValue({
    ...result,
    hasMore: true,
    items: [{ ...result.items[0], identificationStatus: "INCOMPLETE" }],
  });
  render(<CollectionSearch />);
  fireEvent.change(screen.getByLabelText("Search your collection"), {
    target: { value: "chrono" },
  });
  const list = await screen.findByRole("list", { name: "Search results" });
  expect(within(list).getByText("Identity incomplete")).toBeVisible();
  expect(screen.getByText(/Showing the first 1 matches/)).toBeVisible();
});
