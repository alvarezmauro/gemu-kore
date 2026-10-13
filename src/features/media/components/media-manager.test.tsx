import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { changeMedia } from "../actions";
import { checkPhotoUpload, PhotoUploadError, uploadPhoto } from "../upload";
import type { Photo } from "../contracts";
import { MediaManager } from "./media-manager";
vi.mock("../actions", () => ({ changeMedia: vi.fn() }));
vi.mock("../upload", () => ({
  uploadPhoto: vi.fn(),
  checkPhotoUpload: vi.fn(),
  PhotoUploadError: class extends Error {
    constructor(
      message: string,
      public uploadId?: string,
    ) {
      super(message);
    }
  },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const change = vi.mocked(changeMedia);
const upload = vi.mocked(uploadPhoto);
const check = vi.mocked(checkPhotoUpload);
const item = {
  id: "b41b30e9-0562-4896-9740-f9b742c102eb",
  label: "Chrono Trigger · SNES · Copy b41b30e9",
  revision: 4,
};
const photo: Photo = {
  id: "150fd38d-da64-46e6-9a7a-1d04ae980204",
  type: "FRONT",
  caption: "Box front",
  altText: "A red box",
  displayUrl: "/api/media/private/display",
  thumbnailUrl: "/api/media/private/thumbnail",
  width: 40,
  height: 80,
  publicApproved: false,
};
beforeEach(() => {
  change.mockReset();
  upload.mockReset();
  check.mockReset();
  refresh.mockReset();
});
it("shows an honest per-copy empty gallery and no viewer upload controls", () => {
  render(<MediaManager item={item} photos={[]} canManage={false} />);
  expect(
    screen.getByRole("heading", { name: "No photos for this copy" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Choose photos" }),
  ).not.toBeInTheDocument();
});
it("uses descriptive private thumbnail images and offers a full view to viewers", () => {
  render(<MediaManager item={item} photos={[photo]} canManage={false} />);
  expect(screen.getByAltText("A red box")).toHaveAttribute(
    "src",
    photo.thumbnailUrl,
  );
  expect(
    screen.queryByRole("button", { name: /Edit photo/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View photo 1" }));
  expect(
    within(screen.getByRole("dialog")).getByAltText("A red box"),
  ).toHaveAttribute("src", photo.displayUrl);
});
it("preserves entered details and the opening revision after a failed edit", async () => {
  change.mockResolvedValue({ status: "error", message: "This copy changed." });
  const view = render(<MediaManager item={item} photos={[photo]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Edit photo 1" }));
  fireEvent.change(screen.getByLabelText("Caption"), {
    target: { value: "New caption" },
  });
  view.rerender(
    <MediaManager item={{ ...item, revision: 5 }} photos={[photo]} canManage />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("This copy changed."),
  );
  expect(screen.getByLabelText("Caption")).toHaveValue("New caption");
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 4,
      collectionItemId: item.id,
      caption: "New caption",
    }),
  );
});
it("requires an explicit confirmation before detaching a photo", async () => {
  change.mockResolvedValue({ status: "success", message: "Saved" });
  render(<MediaManager item={item} photos={[photo]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
  expect(change).not.toHaveBeenCalled();
  expect(
    screen.getByText(/stored file and its provenance are retained/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^Remove photo$/ }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(change).toHaveBeenCalledWith({
    operation: "delete",
    collectionItemId: item.id,
    expectedRevision: 4,
    id: photo.id,
  });
});
it("provides button ordering alongside drag handles using the exact photo set", async () => {
  change.mockResolvedValue({ status: "success", message: "Saved" });
  const second = { ...photo, id: "981f006d-e78f-4de4-9063-8589880559b2" };
  render(<MediaManager item={item} photos={[photo, second]} canManage />);
  expect(screen.getByRole("button", { name: "Drag photo 1" })).toHaveAttribute(
    "aria-describedby",
    "photo-order-help",
  );
  fireEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({
      operation: "reorder",
      collectionItemId: item.id,
      expectedRevision: 4,
      ids: [second.id, photo.id],
    }),
  );
});
it("queues files sequentially, distinguishes transfer from processing and disables mutations", async () => {
  let finish!: () => void;
  upload
    .mockImplementationOnce((_file, _id, _type, progress) => {
      progress(47);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValueOnce();
  render(<MediaManager item={item} photos={[photo]} canManage />);
  const first = new File(["a"], "first.jpg", { type: "image/jpeg" });
  const second = new File(["b"], "second.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Photo files"), {
    target: { files: [first, second] },
  });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "47");
  expect(screen.getByRole("button", { name: "Edit photo 1" })).toBeDisabled();
  act(() => upload.mock.calls[0][3](100));
  expect(screen.getByText("Processing and saving…")).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  await act(async () => finish());
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls[1][0]).toBe(second);
  expect(screen.getAllByText("Saved privately")).toHaveLength(2);
  expect(refresh).toHaveBeenCalled();
});
it("stops an uncertain batch and reconciles the existing reservation without reuploading", async () => {
  const id = "150fd38d-da64-46e6-9a7a-1d04ae980204";
  upload.mockRejectedValue(new PhotoUploadError("Storage unavailable", id));
  check.mockResolvedValue();
  render(<MediaManager item={item} photos={[]} canManage />);
  fireEvent.change(screen.getByLabelText("Photo files"), {
    target: {
      files: [new File(["a"], "first.jpg"), new File(["b"], "second.jpg")],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Check upload" })).toBeEnabled(),
  );
  expect(upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Check upload" }));
  await waitFor(() => expect(check).toHaveBeenCalledWith(id));
  expect(upload).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByText("Saved privately")).toBeVisible(),
  );
});
it("provides a separate rear-camera input without forcing capture on the library", () => {
  render(<MediaManager item={item} photos={[]} canManage />);
  expect(screen.getByLabelText("Camera photo")).toHaveAttribute(
    "capture",
    "environment",
  );
  expect(screen.getByLabelText("Photo files")).not.toHaveAttribute("capture");
  expect(screen.getByRole("button", { name: "Take a photo" })).toBeEnabled();
});

it("keeps edit fields intact and blocks closing during a pending save", async () => {
  let finish!: (result: { status: "success"; message: string }) => void;
  change.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<MediaManager item={item} photos={[photo]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Edit photo 1" }));
  fireEvent.change(screen.getByLabelText("Caption"), {
    target: { value: "Retain during save" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled(),
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByLabelText("Caption")).toHaveValue("Retain during save");
  await act(async () => finish({ status: "success", message: "Saved" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
