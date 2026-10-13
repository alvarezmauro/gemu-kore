import { afterEach, expect, it, vi } from "vitest";
import { checkPhotoUpload, uploadPhoto } from "./upload";
class RequestFixture {
  static last: RequestFixture;
  upload: {
    onprogress?: (event: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
    onload?: () => void;
  } = {};
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  timeout = 0;
  status = 201;
  responseText = JSON.stringify({
    uploadId: "150fd38d-da64-46e6-9a7a-1d04ae980204",
  });
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  ontimeout?: () => void;
  constructor() {
    RequestFixture.last = this;
  }
}
afterEach(() => vi.unstubAllGlobals());
const photo = () => new File(["bytes"], "my photo.jpg", { type: "image/jpeg" });
it("sends one raw file to the collection target and reports actual transfer progress", async () => {
  vi.stubGlobal("XMLHttpRequest", RequestFixture);
  const progress = vi.fn();
  const file = photo();
  const pending = uploadPhoto(file, "copy", "BOX", progress);
  const request = RequestFixture.last;
  expect(request.open).toHaveBeenCalledWith("POST", "/api/uploads");
  expect(request.setRequestHeader).toHaveBeenCalledWith(
    "X-GemuKore-Target",
    JSON.stringify({ kind: "collection", id: "copy", type: "BOX" }),
  );
  expect(request.send).toHaveBeenCalledWith(file);
  request.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 });
  request.upload.onload!();
  expect(progress.mock.calls).toEqual([[25], [100]]);
  request.onload!();
  await pending;
});
it("does not fabricate a percentage for an unknown transfer length", async () => {
  vi.stubGlobal("XMLHttpRequest", RequestFixture);
  const progress = vi.fn();
  const pending = uploadPhoto(photo(), "copy", "PHOTO", progress);
  RequestFixture.last.upload.onprogress!({
    lengthComputable: false,
    loaded: 5,
    total: 0,
  });
  expect(progress).toHaveBeenCalledWith(null);
  RequestFixture.last.onload!();
  await pending;
});
it("retains only a validated recovery ID on storage failure", async () => {
  vi.stubGlobal("XMLHttpRequest", RequestFixture);
  const pending = uploadPhoto(photo(), "copy", "PHOTO", vi.fn());
  const request = RequestFixture.last;
  request.status = 503;
  request.onload!();
  await expect(pending).rejects.toMatchObject({
    uploadId: "150fd38d-da64-46e6-9a7a-1d04ae980204",
  });
});
it.each(["onerror", "onabort", "ontimeout"] as const)(
  "treats %s as uncertain and never automatically retries",
  async (event) => {
    vi.stubGlobal("XMLHttpRequest", RequestFixture);
    const pending = uploadPhoto(photo(), "copy", "PHOTO", vi.fn());
    RequestFixture.last[event]!();
    await expect(pending).rejects.toThrow(/Refresh/);
    expect(RequestFixture.last.send).toHaveBeenCalledTimes(1);
  },
);
it("does not trust a malformed success body", async () => {
  vi.stubGlobal("XMLHttpRequest", RequestFixture);
  const pending = uploadPhoto(photo(), "copy", "PHOTO", vi.fn());
  RequestFixture.last.responseText = "not json";
  RequestFixture.last.onload!();
  await expect(pending).rejects.toThrow(/confirm/);
});
it("reconciles a prepared upload without resending file bytes", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ uploadId: "150fd38d-da64-46e6-9a7a-1d04ae980204" }),
  });
  vi.stubGlobal("fetch", fetcher);
  await checkPhotoUpload("150fd38d-da64-46e6-9a7a-1d04ae980204");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/uploads/150fd38d-da64-46e6-9a7a-1d04ae980204/complete",
    expect.objectContaining({ method: "POST" }),
  );
});

it("does not offer completion recovery for a rejected image's failed reservation", async () => {
  vi.stubGlobal("XMLHttpRequest", RequestFixture);
  const pending = uploadPhoto(photo(), "copy", "PHOTO", vi.fn());
  RequestFixture.last.status = 400;
  RequestFixture.last.onload!();
  await expect(pending).rejects.toMatchObject({ uploadId: undefined });
});
