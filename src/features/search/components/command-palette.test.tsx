import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { CommandPalette, PaletteTrigger } from "./command-palette";
import { requestPaletteSearch } from "../client";
import type { PaletteResult } from "../palette-contracts";
vi.mock("../client", () => ({ requestPaletteSearch: vi.fn() }));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/magic/blur-fade", () => ({
  BlurFade: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
const request = vi.mocked(requestPaletteSearch);
const item = {
  id: "b41b30e9-0562-4896-9740-f9b742c102eb",
  type: "GAME" as const,
  title: "Chrono Trigger",
  context: "SNES · Japan",
  identificationStatus: "CONFIRMED" as const,
  matchSources: ["Identity" as const],
};
const result: PaletteResult = {
  collection: {
    state: "ready",
    items: [item],
    limit: 20,
    offset: 0,
    hasMore: false,
  },
  catalog: [
    {
      id: "14ee4dac-7a91-4d97-a8db-e38ade0e39b1",
      kind: "game",
      title: "Chrono Trigger",
      context: "",
      identificationStatus: null,
    },
  ],
  catalogHasMore: false,
};
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
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  request.mockReset().mockResolvedValue(result);
  push.mockReset();
});
function mount() {
  render(
    <CommandPalette>
      <PaletteTrigger />
      <input aria-label="Other field" />
    </CommandPalette>,
  );
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
}
const input = () =>
  screen.getByRole("combobox", { name: "Search copies, catalog or pages" });
it("does not expose a trigger outside the private provider", () => {
  render(<PaletteTrigger />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it.each(["ctrlKey", "metaKey"])(
  "opens via %s+K, focuses input, closes via Escape and restores focus",
  async (modifier) => {
    mount();
    const opener = screen.getByLabelText("Other field");
    opener.focus();
    fireEvent.keyDown(document, { key: "k", [modifier]: true });
    expect(
      await screen.findByRole("dialog", { name: "Quick search" }),
    ).toBeVisible();
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.keyDown(input(), { key: "k", [modifier]: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.keyDown(document, { key: "k", [modifier]: true });
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.keyDown(input(), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
    expect(request).not.toHaveBeenCalled();
  },
);
it("ignores modified/composing/repeated shortcuts and another open modal", () => {
  mount();
  for (const extra of [
    { repeat: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
  ])
    fireEvent.keyDown(document, { key: "k", ctrlKey: true, ...extra });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const modal = document.createElement("div");
  modal.setAttribute("role", "dialog");
  modal.dataset.state = "open";
  document.body.append(modal);
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  expect(
    screen.queryByRole("dialog", { name: "Quick search" }),
  ).not.toBeInTheDocument();
  modal.remove();
});
it("groups copies separately from catalog, previews canonical data and routes exact-copy actions", async () => {
  mount();
  open();
  fireEvent.change(input(), { target: { value: "chrono" } });
  const options = await screen.findAllByRole("option", {
    name: /Chrono Trigger/,
  });
  expect(screen.getByText("Games", { exact: true })).toBeVisible();
  expect(screen.getByText("Catalog", { exact: true })).toBeVisible();
  fireEvent.click(options[1]);
  expect(screen.getByText(/Canonical identity/)).toBeVisible();
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("option", { name: "Back to results" }));
  fireEvent.click(screen.getAllByRole("option", { name: /Chrono Trigger/ })[0]);
  fireEvent.click(screen.getByRole("option", { name: "View copy photos" }));
  expect(push).toHaveBeenCalledWith(`/app/media?itemId=${item.id}`);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
it("cancels search on close, forgets private input and never applies an obsolete response", async () => {
  let finish!: (result: PaletteResult) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  open();
  fireEvent.change(input(), { target: { value: "private note" } });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const signal = request.mock.calls[0][1];
  fireEvent.keyDown(input(), { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => finish(result));
  open();
  expect(input()).toHaveValue("");
  expect(screen.queryByText("Chrono Trigger")).not.toBeInTheDocument();
});
it("retains errors for retry and does not retry invalid queries", async () => {
  request.mockRejectedValueOnce(new Error("Search is unavailable."));
  mount();
  open();
  fireEvent.change(input(), { target: { value: "chrono" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  expect(input()).toHaveValue("chrono");
  fireEvent.click(screen.getByRole("option", { name: "Try search again" }));
  await screen.findAllByRole("option", { name: /Chrono Trigger/ });
  fireEvent.change(input(), {
    target: { value: "one two three four five six seven eight nine" },
  });
  expect(input()).toHaveAttribute("aria-invalid", "true");
  expect(
    screen.queryByRole("option", { name: "Try search again" }),
  ).not.toBeInTheDocument();
});
it("offers keyboard navigation shortcuts without sending an idle search", async () => {
  mount();
  open();
  fireEvent.keyDown(input(), { key: "ArrowDown" });
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(push).toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
