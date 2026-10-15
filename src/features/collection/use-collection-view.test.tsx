import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCollectionView, viewPreferenceKey } from "./use-collection-view";
function Control({ label = "view" }) {
  const { view, choose } = useCollectionView("grid");
  return (
    <button onClick={() => choose(view === "grid" ? "list" : "grid")}>
      {label}: {view}
    </button>
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it("restores only supported saved views and writes no collection or search data", () => {
  localStorage.setItem(viewPreferenceKey, "list");
  render(<Control />);
  fireEvent.click(screen.getByRole("button", { name: "view: list" }));
  expect(localStorage.getItem(viewPreferenceKey)).toBe("grid");
  expect(localStorage.length).toBe(1);
});
it("ignores malformed saved preferences without overwriting them on mount", () => {
  localStorage.setItem(viewPreferenceKey, '{"q":"private"}');
  render(<Control />);
  expect(screen.getByRole("button", { name: "view: grid" })).toBeVisible();
  expect(localStorage.getItem(viewPreferenceKey)).toBe('{"q":"private"}');
});
it("synchronizes same-page controls and external storage changes including removal", () => {
  render(
    <>
      <Control label="one" />
      <Control label="two" />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "one: grid" }));
  expect(screen.getByRole("button", { name: "two: list" })).toBeVisible();
  act(() => {
    localStorage.removeItem(viewPreferenceKey);
    window.dispatchEvent(
      new StorageEvent("storage", { key: viewPreferenceKey }),
    );
  });
  expect(screen.getByRole("button", { name: "one: grid" })).toBeVisible();
});
it("keeps switching usable when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<Control />);
  fireEvent.click(screen.getByRole("button", { name: "view: grid" }));
  expect(screen.getByRole("button", { name: "view: list" })).toBeVisible();
});
