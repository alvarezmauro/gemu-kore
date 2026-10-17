import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConsoleControls } from "./console-controls";
import { ConsoleOverrides } from "./console-overrides";
import { changeOwnedConsole } from "../actions";
import {
  uploadCollectionFile,
  checkCollectionUpload,
  PhotoUploadError,
} from "@/features/media/upload";
import type { ConsoleDetail } from "../contracts";
const { refresh, push } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("../actions", () => ({
  changeOwnedConsole: vi.fn(),
  lookupConsoleModels: vi.fn(),
  lookupConsolePlatforms: vi.fn(),
}));
vi.mock("@/features/media/upload", async (original) => ({
  ...(await original<typeof import("@/features/media/upload")>()),
  uploadCollectionFile: vi.fn(),
  checkCollectionUpload: vi.fn(),
}));
const detail: ConsoleDetail = {
  id: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  publicationStatus: "PRIVATE",
  fields: {
    serialNumber: "00001",
    observedMarkings: "",
    notes: "Original",
    hasBox: "unknown",
    locationId: "",
  },
  location: null,
  platform: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "PlayStation",
    revision: 1,
    manufacturer: "Sony",
    generation: 5,
    releaseYear: 1994,
    logoUrl: null,
    archived: false,
  },
  model: {
    id: "22222222-2222-4222-8222-222222222222",
    platformId: "11111111-1111-4111-8111-111111111111",
    name: "SCPH-1000",
    revision: 1,
    manufacturer: null,
    releaseYear: 1994,
    modelNumber: "SCPH-1000",
    description: null,
    markets: ["Japan"],
    regionLock: null,
    identificationStatus: "INCOMPLETE",
    logoUrl: null,
    imageUrl: null,
    archived: false,
  },
  description: null,
  history: null,
  facts: [],
  photos: [],
  catalogImages: [],
  defects: [],
  defectCount: 0,
  overrides: [],
  primaryOverrides: [],
  overridePage: 1,
  moreOverrides: false,
  logo: null,
  modelFile: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(changeOwnedConsole).mockResolvedValue({
    status: "success",
    data: null,
  });
});
it("keeps an open draft and its original copy/catalog revisions after a page refresh, retaining stale errors", async () => {
  const { rerender } = render(
    <ConsoleControls detail={detail} locations={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit console" }));
  fireEvent.change(screen.getByLabelText("Private notes"), {
    target: { value: "Keep draft" },
  });
  rerender(
    <ConsoleControls
      detail={{
        ...detail,
        revision: 2,
        model: { ...detail.model, revision: 2 },
        fields: { ...detail.fields, notes: "Elsewhere" },
      }}
      locations={[]}
    />,
  );
  vi.mocked(changeOwnedConsole).mockResolvedValue({
    status: "error",
    message: "This copy changed while you were editing.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(changeOwnedConsole).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        modelRevision: 1,
        notes: "Keep draft",
      }),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("copy changed");
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  expect(screen.getByLabelText("Private notes")).toHaveValue("Keep draft");
  expect(
    screen.queryByRole("button", { name: "Add defect" }),
  ).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});
it("deletes only after confirmation and captures the revision when the confirmation opens", async () => {
  const { rerender } = render(
    <ConsoleControls detail={detail} locations={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete console" }));
  expect(changeOwnedConsole).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(changeOwnedConsole).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete console" }));
  rerender(
    <ConsoleControls detail={{ ...detail, revision: 3 }} locations={[]} />,
  );
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete console",
    }),
  );
  await waitFor(() =>
    expect(changeOwnedConsole).toHaveBeenCalledWith({
      operation: "delete",
      id: detail.id,
      expectedRevision: 1,
    }),
  );
  expect(push).toHaveBeenCalledWith("/app/collection");
});
it("uploads an override without selecting it and leaves explicit selection to the refreshed revision", async () => {
  vi.mocked(uploadCollectionFile).mockResolvedValue({
    uploadId: "upload",
    useId: "use",
  });
  render(<ConsoleOverrides detail={detail} canManage />);
  fireEvent.change(screen.getByLabelText("Choose override file"), {
    target: { files: [new File(["image"], "logo.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(changeOwnedConsole).not.toHaveBeenCalled();
  expect(screen.getByText(/File saved privately/)).toBeInTheDocument();
});
it("checks a known uncertain upload without resending the original file", async () => {
  vi.mocked(uploadCollectionFile).mockRejectedValue(
    new PhotoUploadError("Check this upload", "upload-id"),
  );
  vi.mocked(checkCollectionUpload).mockResolvedValue({
    uploadId: "upload-id",
    useId: "use-id",
  });
  render(<ConsoleOverrides detail={detail} canManage />);
  fireEvent.change(screen.getByLabelText("Choose override file"), {
    target: { files: [new File(["image"], "logo.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
  const check = await screen.findByRole("button", { name: "Check upload" });
  await waitFor(() => expect(check).toBeEnabled());
  fireEvent.click(check);
  await waitFor(() =>
    expect(checkCollectionUpload).toHaveBeenCalledWith("upload-id"),
  );
  expect(uploadCollectionFile).toHaveBeenCalledTimes(1);
  expect(changeOwnedConsole).not.toHaveBeenCalled();
});
it("shows saved override files to viewers with no upload, removal or selection controls", () => {
  render(<ConsoleOverrides detail={detail} canManage={false} />);
  expect(
    screen.queryByLabelText("Choose override file"),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
