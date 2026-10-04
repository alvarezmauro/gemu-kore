import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BlurFade } from "./blur-fade";

vi.mock("@/lib/motion/use-motion-preference", () => ({
  useMotionAllowed: () => false,
}));

it("keeps content immediately readable with reduced motion, even before scrolling into view", () => {
  render(
    <BlurFade inView delay={10}>
      <p>Collection details</p>
    </BlurFade>,
  );
  const text = screen.getByText("Collection details");
  expect(text).toBeVisible();
  expect(text.parentElement).not.toHaveAttribute("style");
});

it("server-renders complete visible content without needing hydration", () => {
  const html = renderToStaticMarkup(
    <BlurFade inView>
      <p>Server-rendered details</p>
    </BlurFade>,
  );
  expect(html).toContain("Server-rendered details");
  expect(html).not.toContain("style=");
  expect(html).not.toContain("hidden");
});
