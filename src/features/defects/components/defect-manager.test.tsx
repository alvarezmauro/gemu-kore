import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { changeDefect } from "../actions";
import type { DefectActionResult, DefectSummary } from "../contracts";
import { DefectManager } from "./defect-manager";
vi.mock("../actions", () => ({ changeDefect: vi.fn() }));
const change = vi.mocked(changeDefect);
const item = {
  id: "b41b30e9-0562-4896-9740-f9b742c102eb",
  label: "Chrono Trigger · SNES · Copy b41b30e9",
  revision: 4,
};
const defect: DefectSummary = {
  id: "150fd38d-da64-46e6-9a7a-1d04ae980204",
  collectionItemId: item.id,
  title: "Yellowed plastic",
  description: "Appearance only",
  severity: "COSMETIC",
  status: "ACCEPTED",
  resolvedAt: null,
  repairNote: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};
beforeEach(() => {
  change.mockReset();
});
it("distinguishes recorded condition from an uninspected copy", () => {
  render(<DefectManager item={item} defects={[]} canManage={false} />);
  expect(
    screen.getByRole("heading", { name: "No defects recorded" }),
  ).toBeVisible();
  expect(screen.getByText(/not necessarily been checked/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add defect" }),
  ).not.toBeInTheDocument();
});
it("labels accepted records unresolved and offers no viewer mutation controls", () => {
  render(<DefectManager item={item} defects={[defect]} canManage={false} />);
  expect(
    screen.getByText("0 active · 1 accepted · 0 repaired · 1 unresolved"),
  ).toBeVisible();
  expect(screen.getByText("Acknowledged; still unresolved.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Edit|Delete/ }),
  ).not.toBeInTheDocument();
});
it("submits one structured defect tied to the selected copy and its opening revision", async () => {
  change.mockResolvedValue({ status: "success", message: "Defect saved." });
  render(<DefectManager item={item} defects={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add defect" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Title/), {
    target: { value: "Broken hinge" },
  });
  fireEvent.change(within(dialog).getByLabelText("Severity"), {
    target: { value: "MAJOR" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save defect" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(change).toHaveBeenCalledWith({
    operation: "create",
    collectionItemId: item.id,
    expectedRevision: 4,
    title: "Broken hinge",
    description: "",
    severity: "MAJOR",
    status: "ACTIVE",
    repairNote: "",
  });
  expect(screen.getByRole("status")).toHaveTextContent("Defect added.");
});
it("retains a stale form's values and baseline even when fresh props arrive", async () => {
  change.mockResolvedValue({
    status: "error",
    message: "This copy changed while you were editing.",
  });
  const { rerender } = render(
    <DefectManager item={item} defects={[defect]} canManage />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Edit Yellowed plastic" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Title/), {
    target: { value: "My entered title" },
  });
  rerender(
    <DefectManager
      item={{ ...item, revision: 5 }}
      defects={[defect]}
      canManage
    />,
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Save defect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "changed while you were editing",
  );
  expect(within(dialog).getByLabelText(/Title/)).toHaveValue(
    "My entered title",
  );
  expect(change.mock.calls[0][0]).toMatchObject({ expectedRevision: 4 });
});
it("disables duplicate saves and closes the form only after success", async () => {
  let resolve!: (value: DefectActionResult) => void;
  change.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<DefectManager item={item} defects={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add defect" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Title/), {
    target: { value: "Scratch" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save defect" }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Saving…" }),
    ).toBeDisabled(),
  );
  expect(within(dialog).getByLabelText(/Title/)).toBeDisabled();
  await act(async () => resolve({ status: "success", message: "Saved" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(change).toHaveBeenCalledTimes(1);
});
it("requires confirmation and offers repaired status as the record-preserving option", () => {
  render(<DefectManager item={item} defects={[defect]} canManage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Delete Yellowed plastic" }),
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "change its status to Repaired instead",
  );
  expect(change).not.toHaveBeenCalled();
});
it("reports a lost response without losing input or exposing technical error details", async () => {
  change.mockRejectedValue(new Error("Private internal error"));
  render(<DefectManager item={item} defects={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Add defect" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/Title/), {
    target: { value: "Fault" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save defect" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Refresh the page before trying again",
  );
  expect(within(dialog).getByLabelText(/Title/)).toHaveValue("Fault");
  expect(screen.queryByText("Private internal error")).not.toBeInTheDocument();
});
