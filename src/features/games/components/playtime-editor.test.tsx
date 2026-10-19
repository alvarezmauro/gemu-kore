import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlaytimeEditor, type PlaytimeEditorRecord } from "./playtime-editor";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("../playtime-actions", () => ({ changePlaytime: mocks.save }));
it("keeps a draft while reloading saved estimates, reviews both sets, and submits only an explicit acceptance of the latest revision", async () => {
  mocks.save.mockResolvedValue({ status: "success" });
  const record: PlaytimeEditorRecord = {
    kind: "game",
    id: "981e6d4d-a8a3-46bb-b9eb-2a697b2b08a7",
    revision: 1,
    archived: false,
    estimates: {
      mainMinutes: 60,
      mainExtrasMinutes: null,
      completionistMinutes: null,
      sourceType: "MANUAL",
      sourceName: "Original estimate",
      sourceUrl: null,
      observedAt: "2024-02-29T16:20:30.000Z",
      updatedAt: "2024-02-29T16:20:30.000Z",
    },
  };
  const view = render(<PlaytimeEditor record={record} />);
  fireEvent.change(screen.getByLabelText("Main story (minutes)"), {
    target: { value: "120" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved estimates" }),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
  view.rerender(
    <PlaytimeEditor
      record={{
        ...record,
        revision: 2,
        estimates: {
          ...record.estimates!,
          mainMinutes: 180,
          sourceName: "Winning estimate",
        },
      }}
    />,
  );
  expect(screen.getByLabelText("Main story (minutes)")).toHaveValue("120");
  fireEvent.click(screen.getByRole("button", { name: "Review estimates" }));
  await screen.findByRole("dialog");
  expect(
    within(screen.getByRole("region", { name: "Current set" })).getByText(
      "3 hr",
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "After saving" })).getByText(
      "2 hr",
    ),
  ).toBeVisible();
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and save" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith({
      kind: "game",
      id: record.id,
      expectedRevision: 2,
      reviewed: true,
      estimates: {
        mainMinutes: 120,
        mainExtrasMinutes: null,
        completionistMinutes: null,
        sourceType: "MANUAL",
        sourceName: "Original estimate",
        sourceUrl: null,
        observedAt: "2024-02-29T16:20:30.000Z",
      },
    }),
  );
});
