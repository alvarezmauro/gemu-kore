import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  modelPresentation,
  type ModelPresentationResult,
} from "@/lib/three/contracts";
import { ModelViewer } from "./model-viewer";
vi.mock("next/dynamic", () => ({
  default: () =>
    function Runtime({
      onReady,
      onExpand,
      onError,
    }: {
      onReady: () => void;
      onExpand: () => void;
      onError: (message: string) => void;
    }) {
      return (
        <div>
          <canvas data-testid="model-canvas" />
          <button onClick={onReady}>Render frame</button>
          <button onClick={onExpand}>Expand</button>
          <button onClick={() => onError("Interrupted")}>Fail</button>
        </div>
      );
    },
}));
const id = "11111111-1111-4111-8111-111111111111";
const data = modelPresentation.parse({
  schemaVersion: 1,
  presentationKey: "test",
  title: "Console",
  source: "Catalog",
  description: "Preview",
  resource: {
    id,
    url: `/api/media/private/${id}`,
    mimeType: "model/gltf-binary",
    byteLength: 20,
  },
  poster: null,
  settings: {},
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
it("keeps a static fallback and never loads before explicit activation, then closes the only runtime", async () => {
  const load = vi.fn().mockResolvedValue({ status: "success", data });
  render(<ModelViewer title="Console" source="Catalog" load={load} />);
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View in 3D" }));
  expect(await screen.findByTestId("model-canvas")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Render frame"));
  expect(
    screen.queryByText("Static preview unavailable"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close 3D preview" }));
  expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "View in 3D" })).toHaveFocus(),
  );
});
it("ignores an old server answer after closing while access is being checked", async () => {
  let finish!: (result: ModelPresentationResult) => void;
  const load = vi.fn(
    () =>
      new Promise<ModelPresentationResult>((resolve) => {
        finish = resolve;
      }),
  );
  render(<ModelViewer title="Console" source="Catalog" load={load} />);
  fireEvent.click(screen.getByText("View in 3D"));
  fireEvent.click(screen.getByText("Close 3D preview"));
  finish({ status: "success", data });
  await waitFor(() =>
    expect(
      screen.queryByText("Checking access to this model…"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
});
it("rechecks access when expanding and mounts one runtime in the accessible dialog", async () => {
  const load = vi.fn().mockResolvedValue({ status: "success", data });
  render(<ModelViewer title="Console" source="Catalog" load={load} />);
  fireEvent.click(screen.getByText("View in 3D"));
  fireEvent.click(await screen.findByText("Expand"));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getAllByTestId("model-canvas")).toHaveLength(1);
  expect(load).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText("Close 3D preview"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retains a fallback for changed access or a failed runtime and can retry", async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce({ status: "error", message: "Access changed" })
    .mockResolvedValue({ status: "success", data });
  render(<ModelViewer title="Console" source="Catalog" load={load} />);
  fireEvent.click(screen.getByText("View in 3D"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Access changed");
  fireEvent.click(screen.getByText("Try 3D again"));
  fireEvent.click(await screen.findByText("Fail"));
  expect(screen.getByRole("alert")).toHaveTextContent("Interrupted");
  expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
  expect(screen.getByText("Static preview unavailable")).toBeInTheDocument();
});
it("rejects an unexpected descriptor before loading a renderer and handles a missing model", async () => {
  const load = vi.fn().mockResolvedValue({
    status: "success",
    data: {
      ...data,
      resource: { ...data.resource, url: "https://example.com/a.glb" },
    },
  });
  const { unmount } = render(
    <ModelViewer title="Console" source="Catalog" load={load} />,
  );
  fireEvent.click(screen.getByText("View in 3D"));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
  unmount();
  render(
    <ModelViewer
      title="Console"
      source="Catalog"
      load={load}
      available={false}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(/No 3D model is available/)).toBeInTheDocument();
});
