import { act, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { NumberTicker } from "./number-ticker";
const state = vi.hoisted(() => ({
  allowed: false,
  update: undefined as ((value: number) => void) | undefined,
  stop: vi.fn(),
}));
vi.mock("@/lib/motion/use-motion-preference", () => ({
  useMotionAllowed: () => state.allowed,
}));
vi.mock("motion/react", () => ({
  animate: (
    _from: number,
    _to: number,
    options: { onUpdate: (value: number) => void },
  ) => {
    state.update = options.onUpdate;
    return { stop: state.stop };
  },
}));
beforeEach(() => {
  state.allowed = false;
  state.update = undefined;
  state.stop.mockClear();
});
it("renders the real formatted value before hydration and keeps reduced-motion updates static", () => {
  const html = renderToStaticMarkup(<NumberTicker value={12345} />);
  expect(html).toContain("12,345");
  expect(html).not.toContain("style=");
  const { container, rerender } = render(<NumberTicker value={12345} />);
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "12,345",
  );
  expect(state.update).toBeUndefined();
  rerender(<NumberTicker value={0} />);
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "0",
  );
});
it("keeps assistive text accurate while animating and blocks queued writes after live reduction", () => {
  state.allowed = true;
  const { container, rerender } = render(<NumberTicker value={200} />);
  const update = state.update!;
  act(() => update(60));
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "60",
  );
  expect(container.querySelector(".sr-only")).toHaveTextContent("200");
  state.allowed = false;
  rerender(<NumberTicker value={200} />);
  expect(state.stop).toHaveBeenCalled();
  act(() => update(70));
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    "200",
  );
});
