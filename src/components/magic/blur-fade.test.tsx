import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BlurFade } from "./blur-fade";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

it("keeps content immediately readable with reduced motion, even before scrolling into view", () => {
  render(
    <BlurFade inView delay={10}>
      <p>Collection details</p>
    </BlurFade>,
  );

  expect(screen.getByText("Collection details")).toBeVisible();
});
