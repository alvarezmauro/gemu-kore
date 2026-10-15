import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ConsoleWizard } from "./console-wizard";
import {
  lookupConsoleModels,
  lookupConsolePlatforms,
  saveConsole,
  selectConsoleOverride,
} from "../actions";
import {
  checkCollectionUpload,
  uploadCollectionFile,
} from "@/features/media/upload";
import type { ConsoleModelOption, ConsolePlatformOption } from "../contracts";
vi.mock("../actions", () => ({
  lookupConsoleModels: vi.fn(),
  lookupConsolePlatforms: vi.fn(),
  saveConsole: vi.fn(),
  selectConsoleOverride: vi.fn(),
}));
vi.mock("@/features/media/upload", async (original) => ({
  ...(await original<typeof import("@/features/media/upload")>()),
  uploadCollectionFile: vi.fn(),
  checkCollectionUpload: vi.fn(),
}));
vi.mock("@/components/magic/blur-fade", () => ({
  BlurFade: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
const platform: ConsolePlatformOption = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "PlayStation",
  revision: 1,
  manufacturer: "Sony",
  generation: 5,
  releaseYear: 1994,
  logoUrl: null,
};
const model: ConsoleModelOption = {
  id: "22222222-2222-4222-8222-222222222222",
  platformId: platform.id,
  revision: 1,
  name: "SCPH-1000",
  modelNumber: "SCPH-1000",
  releaseYear: 1994,
  manufacturer: null,
  description: null,
  identificationStatus: "INCOMPLETE",
  markets: ["Japan"],
  regionLock: null,
  logoUrl: null,
  imageUrl: null,
};
const copyId = "33333333-3333-4333-8333-333333333333";
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:fixture");
  URL.revokeObjectURL = vi.fn();
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookupConsoleModels).mockResolvedValue({
    status: "success",
    data: { items: [model], hasMore: false, page: 0 },
  });
  vi.mocked(lookupConsolePlatforms).mockResolvedValue({
    status: "success",
    data: { items: [platform], hasMore: false, page: 0 },
  });
  vi.mocked(saveConsole).mockResolvedValue({
    status: "success",
    data: { id: copyId },
  });
  vi.mocked(selectConsoleOverride).mockResolvedValue({
    status: "success",
    data: null,
  });
  vi.mocked(uploadCollectionFile).mockResolvedValue({
    uploadId: copyId,
    useId: model.id,
  });
});
function mount() {
  render(
    <ConsoleWizard
      platforms={{ items: [platform], hasMore: false, page: 0 }}
      locations={[]}
    />,
  );
}
async function next() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
}
async function physical() {
  fireEvent.click(screen.getByRole("option", { name: "Select PlayStation" }));
  await next();
  await next();
}
async function review() {
  await next();
  await next();
  await next();
}
it("requires selection, auto-selects a sole model, preserves copy details through Back and saves only from review", async () => {
  mount();
  await next();
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a console");
  await physical();
  fireEvent.change(screen.getByLabelText("Serial number"), {
    target: { value: "00001" },
  });
  fireEvent.change(
    screen.getByLabelText("Observed markings or identification uncertainty"),
    { target: { value: "Possible replacement shell" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Add defect" }));
  await next();
  expect(screen.getByRole("alert")).toHaveTextContent("title");
  fireEvent.change(screen.getByLabelText(/Defect 1 title/), {
    target: { value: "Yellowing" },
  });
  await next();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("Serial number")).toHaveValue("00001");
  await review();
  expect(saveConsole).not.toHaveBeenCalled();
  expect(screen.getByText("Commercial markets: Japan")).toBeVisible();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save console" })),
  );
  expect(saveConsole).toHaveBeenCalledWith(
    expect.objectContaining({
      serialNumber: "00001",
      observedMarkings: "Possible replacement shell",
      hasBox: "unknown",
      modelId: model.id,
      defects: [{ title: "Yellowing", description: "", severity: "COSMETIC" }],
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Console saved privately" }),
  ).toBeVisible();
});
it("keeps failures focused and retries an uncertain save with the same copy reference", async () => {
  vi.mocked(saveConsole).mockRejectedValueOnce(new Error("network"));
  mount();
  await physical();
  await review();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save console" })),
  );
  expect(screen.getByRole("alert")).toHaveFocus();
  const first = vi.mocked(saveConsole).mock.calls[0][0];
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save console" })),
  );
  expect(vi.mocked(saveConsole).mock.calls[1][0]).toEqual(first);
});
it("requires a choice when there are multiple models", async () => {
  vi.mocked(lookupConsoleModels).mockResolvedValue({
    status: "success",
    data: {
      items: [model, { ...model, id: copyId, name: "PS one" }],
      hasMore: false,
      page: 0,
    },
  });
  mount();
  fireEvent.click(screen.getByRole("option", { name: "Select PlayStation" }));
  await next();
  await next();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose a hardware model",
  );
  fireEvent.click(screen.getByRole("option", { name: "Select SCPH-1000" }));
  await next();
  expect(screen.getByLabelText("Serial number")).toBeVisible();
});
it("stages photos and overrides locally, then activates only copy-specific uploaded uses", async () => {
  mount();
  await physical();
  await next();
  const photo = new File(["image"], "front.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Choose photos"), {
    target: { files: [photo] },
  });
  await next();
  fireEvent.change(screen.getByLabelText("Custom logo"), {
    target: { files: [new File(["logo"], "logo.png", { type: "image/png" })] },
  });
  expect(uploadCollectionFile).not.toHaveBeenCalled();
  await next();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save console" })),
  );
  expect(uploadCollectionFile).toHaveBeenNthCalledWith(
    1,
    photo,
    copyId,
    "PHOTO",
    expect.any(Function),
  );
  expect(selectConsoleOverride).toHaveBeenCalledWith({
    collectionItemId: copyId,
    useId: model.id,
    type: "CUSTOM_LOGO",
  });
  expect(saveConsole).toHaveBeenCalledTimes(1);
});
it("keeps the saved copy on file failure and recovers without resending bytes or recreating it", async () => {
  const { PhotoUploadError } = await import("@/features/media/upload");
  vi.mocked(uploadCollectionFile).mockRejectedValueOnce(
    new PhotoUploadError("Check this upload", copyId),
  );
  vi.mocked(checkCollectionUpload).mockResolvedValue({
    uploadId: copyId,
    useId: model.id,
  });
  mount();
  await physical();
  await next();
  fireEvent.change(screen.getByLabelText("Choose photos"), {
    target: {
      files: [new File(["bytes"], "front.png", { type: "image/png" })],
    },
  });
  await next();
  await next();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save console" })),
  );
  expect(
    screen.getByRole("heading", { name: "Console saved privately" }),
  ).toBeVisible();
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Check upload for front.png" }),
    ),
  );
  expect(checkCollectionUpload).toHaveBeenCalledWith(copyId);
  expect(uploadCollectionFile).toHaveBeenCalledTimes(1);
  expect(saveConsole).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByText("Saved privately", { exact: true })).toBeVisible(),
  );
});
