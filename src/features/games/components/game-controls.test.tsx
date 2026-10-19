import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GameControls } from "./game-controls";
import { submitGameChange } from "../management-client";
import type { GameCopyDetail } from "../management-contracts";
const { refresh, push } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("../management-client", () => ({ submitGameChange: vi.fn() }));
vi.mock("../creation-actions", () => ({
  lookupGames: vi.fn(),
  lookupGameReleases: vi.fn(),
}));
vi.mock("@/features/consoles/actions", () => ({
  lookupConsolePlatforms: vi.fn(),
}));
const detail: Pick<
  GameCopyDetail,
  "id" | "revision" | "fields" | "game" | "platform" | "release"
> = {
  id: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  fields: {
    serialNumber: "00001",
    observedMarkings: "",
    hasBox: "unknown",
    locationId: "",
    notes: "Original",
  },
  game: {
    id: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    name: "Chrono Trigger",
    slug: "chrono-trigger",
    description: null,
    archived: false,
  },
  platform: {
    id: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    name: "SNES",
    manufacturer: null,
    generation: null,
    releaseYear: null,
    logoUrl: null,
    archived: false,
  },
  release: {
    id: "44444444-4444-4444-8444-444444444444",
    revision: 1,
    gameId: "11111111-1111-4111-8111-111111111111",
    platformId: "22222222-2222-4222-8222-222222222222",
    name: "Standard Edition",
    slug: "chrono-snes",
    editionType: "STANDARD",
    editionName: "Standard Edition",
    printingLabel: null,
    markets: [],
    languages: [],
    description: null,
    identificationStatus: "INCOMPLETE",
    regionLock: null,
    regionLockNote: null,
    components: [],
    archived: false,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(submitGameChange).mockResolvedValue({
    status: "success",
    data: null,
  });
});
it("keeps a draft and its captured revision when a refreshed page arrives during editing", async () => {
  const view = render(<GameControls detail={detail} locations={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit game" }));
  fireEvent.change(screen.getByLabelText("Private notes"), {
    target: { value: "My draft" },
  });
  view.rerender(
    <GameControls
      detail={{
        ...detail,
        revision: 2,
        fields: { ...detail.fields, notes: "Saved elsewhere" },
      }}
      locations={[]}
    />,
  );
  vi.mocked(submitGameChange).mockResolvedValue({
    status: "error",
    message: "This copy changed while editing.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(screen.getByLabelText("Private notes")).toHaveValue("My draft");
  expect(submitGameChange).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 1,
      notes: "My draft",
      releaseId: detail.release.id,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit game" }));
  expect(screen.getByLabelText("Private notes")).toHaveValue("Saved elsewhere");
});
it("submits copy fields with distinct canonical revisions, then closes and refreshes", async () => {
  render(<GameControls detail={detail} locations={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit game" }));
  fireEvent.change(screen.getByLabelText("Serial number"), {
    target: { value: "00002" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(submitGameChange).toHaveBeenCalledWith({
    operation: "update",
    id: detail.id,
    expectedRevision: 1,
    ...detail.fields,
    serialNumber: "00002",
    gameId: detail.game.id,
    gameRevision: 1,
    platformId: detail.platform.id,
    platformRevision: 1,
    releaseId: detail.release.id,
    releaseRevision: 1,
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("Game saved.");
});
it("cancels deletion without writing and captures the reviewed revision for a single pending request", async () => {
  const view = render(<GameControls detail={detail} locations={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete game" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(submitGameChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete game" }));
  view.rerender(
    <GameControls detail={{ ...detail, revision: 2 }} locations={[]} />,
  );
  let finish!: (value: Awaited<ReturnType<typeof submitGameChange>>) => void;
  vi.mocked(submitGameChange).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete game",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled(),
  );
  expect(submitGameChange).toHaveBeenCalledExactlyOnceWith({
    operation: "delete",
    id: detail.id,
    expectedRevision: 1,
  });
  await act(async () => finish({ status: "success", data: null }));
  expect(push).toHaveBeenCalledWith("/app/collection");
});
