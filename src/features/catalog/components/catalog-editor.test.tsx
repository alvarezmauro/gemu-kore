import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CatalogEditor } from "./catalog-editor";
import {
  changeCatalog,
  changeCatalogArchive,
  findCatalogOptions,
} from "../actions";
import type { CatalogActionResult, CatalogRecord } from "../contracts";
vi.mock("../actions", () => ({
  changeCatalog: vi.fn(),
  changeCatalogArchive: vi.fn(),
  findCatalogOptions: vi.fn(),
}));
const push = vi.fn(),
  refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const record: CatalogRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sony",
  revision: 2,
  archived: false,
  fields: {
    name: "Sony",
    slug: "sony",
    description: "",
    countryCode: "JP",
    foundedYear: "1946",
    website: "",
    aliases: "",
  },
  markets: [],
  manufacturer: null,
  platform: null,
  references: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findCatalogOptions).mockResolvedValue({
    status: "success",
    options: [],
  });
});
it("preserves fields and focuses the save failure", async () => {
  vi.mocked(changeCatalog).mockResolvedValue({
    status: "error",
    message: "This record changed while you were editing.",
  });
  render(<CatalogEditor kind="company" record={record} />);
  fireEvent.change(screen.getByLabelText("Name (required)"), {
    target: { value: "Sony Corporation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save catalog record" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed");
  expect(screen.getByLabelText("Name (required)")).toHaveValue(
    "Sony Corporation",
  );
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(changeCatalog).toHaveBeenCalledWith(
    expect.objectContaining({
      id: record.id,
      expectedRevision: 2,
      fields: expect.objectContaining({ name: "Sony Corporation" }),
    }),
  );
});
it("prevents duplicate saves while a request is pending", async () => {
  let resolve!: (r: CatalogActionResult) => void;
  vi.mocked(changeCatalog).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<CatalogEditor kind="company" record={record} />);
  const button = screen.getByRole("button", { name: "Save catalog record" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(screen.getByLabelText("Name (required)")).toBeDisabled();
  expect(changeCatalog).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ status: "success", id: record.id }));
  expect(push).toHaveBeenCalledWith(expect.stringContaining(record.id));
});
it("confirms archive separately from unsaved field edits", async () => {
  vi.mocked(changeCatalogArchive).mockResolvedValue({
    status: "success",
    id: record.id,
  });
  render(<CatalogEditor kind="company" record={record} />);
  fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("Unsaved form changes will not be applied.");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm archive" }),
  );
  await waitFor(() =>
    expect(changeCatalogArchive).toHaveBeenCalledWith({
      kind: "company",
      id: record.id,
      expectedRevision: 2,
      archived: true,
    }),
  );
  expect(changeCatalog).not.toHaveBeenCalled();
});
it("keeps archived records read-only and offers restore", () => {
  render(
    <CatalogEditor kind="company" record={{ ...record, archived: true }} />,
  );
  expect(screen.getByLabelText("Name (required)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Restore record" })).toBeEnabled();
});
it("keeps markets separate from region lock and searches required platform", async () => {
  vi.mocked(findCatalogOptions).mockResolvedValue({
    status: "success",
    options: [{ id: record.id, name: "PlayStation", archived: false }],
  });
  render(<CatalogEditor kind="model" record={null} />);
  expect(
    screen.getByText("No known markets. This does not mean Worldwide."),
  ).toBeVisible();
  const input = screen.getByLabelText("Find platform (required)");
  fireEvent.change(input, { target: { value: "PlayStation" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(
    await screen.findByRole("button", { name: "Select PlayStation" }),
  );
  expect(findCatalogOptions).toHaveBeenCalledWith({
    kind: "platform",
    query: "PlayStation",
  });
  expect(screen.getByLabelText("Region lock")).toHaveValue("");
});
it("adds and removes typed references without submitting the form", () => {
  render(<CatalogEditor kind="company" record={record} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Add external reference" }),
  );
  expect(screen.getByLabelText("Object type")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remove reference 1" }));
  expect(screen.queryByLabelText("Object type")).not.toBeInTheDocument();
  expect(changeCatalog).not.toHaveBeenCalled();
});
