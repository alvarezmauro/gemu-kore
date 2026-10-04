import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  locationEntries,
  type LocationSummary,
  type LocationActionResult,
} from "../contracts";
import { changeLocation } from "../actions";
import { LocationManager } from "./location-manager";

vi.mock("../actions", () => ({ changeLocation: vi.fn() }));
const change = vi.mocked(changeLocation);
const row = (
  id: string,
  name: string,
  parentId: string | null = null,
): LocationSummary => ({
  id,
  name,
  parentId,
  type: "CUSTOM",
  description: null,
  sortOrder: 0,
  updatedAt: "2026-10-04T00:00:00.000Z",
  itemCount: 0,
  childCount: 0,
});
const home = row("9c6c919a-45b1-4a52-b48e-58a7f0aa219b", "Home");
const shelf = row("987d4450-629f-4e65-91a7-d0696a7b0c8c", "Shelf", home.id);
beforeEach(() => {
  change.mockReset();
});

it("renders private breadcrumbs for viewers without any editing controls", () => {
  render(
    <LocationManager
      locations={locationEntries([home, shelf])}
      canManage={false}
    />,
  );
  expect(
    screen.getByRole("navigation", { name: "Path to Shelf" }),
  ).toHaveTextContent("Home / Shelf");
  expect(screen.getByText(/View-only access/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Add|Edit|Move|Delete/ }),
  ).not.toBeInTheDocument();
});
it("keeps submitted details when a duplicate name is rejected", async () => {
  change.mockResolvedValue({
    status: "error",
    message: "A location with this name already exists.",
  });
  render(<LocationManager locations={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add location" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Name/), {
    target: { value: " Home " },
  });
  fireEvent.change(within(dialog).getByLabelText(/Description/), {
    target: { value: "My collection room" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add location" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  expect(within(dialog).getByLabelText(/Name/)).toHaveValue(" Home ");
  expect(within(dialog).getByLabelText(/Description/)).toHaveValue(
    "My collection room",
  );
  expect(change).toHaveBeenCalledWith({
    operation: "create",
    name: " Home ",
    type: "CUSTOM",
    parentId: null,
    description: "My collection room",
  });
});
it("excludes a location and its descendants from the move selector", () => {
  render(
    <LocationManager locations={locationEntries([home, shelf])} canManage />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit or move Home" }));
  expect(
    within(screen.getByLabelText("Parent location"))
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["No parent (top level)"]);
});
it("disables deletion for occupied locations and offers a confirmation for unused leaves", () => {
  render(
    <LocationManager
      locations={locationEntries([
        { ...home, childCount: 1 },
        { ...shelf, itemCount: 1 },
        row("unused", "Unused"),
      ])}
      canManage
    />,
  );
  expect(screen.getByRole("button", { name: "Delete Home" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete Shelf" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Delete Unused" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "This cannot be undone",
  );
  expect(change).not.toHaveBeenCalled();
});
it("prevents duplicate form submission while saving, then announces success", async () => {
  let resolve!: (result: LocationActionResult) => void;
  change.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<LocationManager locations={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add location" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Name/), {
    target: { value: "Home" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add location" }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Saving…" }),
    ).toBeDisabled(),
  );
  expect(within(dialog).getByLabelText(/Name/)).toBeDisabled();
  await act(async () =>
    resolve({ status: "success", message: "Location updated." }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Location added.");
  expect(change).toHaveBeenCalledTimes(1);
});
it("turns a lost action response into recoverable feedback and keeps the form", async () => {
  change.mockRejectedValue(new Error("Network failed"));
  render(<LocationManager locations={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add location" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Name/), {
    target: { value: "Room" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add location" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Refresh the page before trying again",
  );
  expect(within(dialog).getByLabelText(/Name/)).toHaveValue("Room");
});
