import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CopySelector } from "./copy-selector";
import { lookupCollectionCopies } from "../copy-actions";
vi.mock("../copy-actions", () => ({ lookupCollectionCopies: vi.fn() }));

it("preserves a chosen copy across POST search, paging, empty matches and lookup errors", async () => {
  const selected = { id: "chosen", label: "Chosen copy" };
  const other = { id: "other", label: "Other copy" };
  const search = vi.mocked(lookupCollectionCopies);
  search.mockResolvedValueOnce({
    status: "success",
    data: { items: [other], page: 0, hasMore: true },
  });
  render(
    <CopySelector
      action="/app/media"
      id="copy"
      initial={{ items: [], page: 0, hasMore: true }}
      selected={selected}
    />,
  );
  expect(screen.getByLabelText("Collection copy")).toHaveValue("chosen");
  fireEvent.change(screen.getByLabelText("Search copies"), {
    target: { value: "private name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find copies" }));
  await screen.findByRole("option", { name: "Other copy" });
  expect(search).toHaveBeenLastCalledWith({ query: "private name", page: 0 });
  fireEvent.change(screen.getByLabelText("Collection copy"), {
    target: { value: "other" },
  });
  search.mockResolvedValueOnce({
    status: "success",
    data: { items: [], page: 1, hasMore: false },
  });
  fireEvent.change(screen.getByLabelText("Search copies"), {
    target: { value: "unsubmitted" },
  });
  fireEvent.click(screen.getByRole("button", { name: "More copies" }));
  await screen.findByText(/No matching copies/);
  expect(search).toHaveBeenLastCalledWith({ query: "private name", page: 1 });
  expect(screen.getByLabelText("Collection copy")).toHaveValue("other");
  expect(screen.getByRole("button", { name: "More copies" })).toBeDisabled();
  search.mockResolvedValueOnce({ status: "error", message: "Access changed" });
  fireEvent.click(screen.getByRole("button", { name: "Previous copies" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Access changed"),
  );
  expect(
    screen.getByRole("button", { name: "View copy" }).closest("form"),
  ).toHaveAttribute("method", "get");
  expect(screen.getByLabelText("Search copies")).not.toHaveAttribute("name");
});
