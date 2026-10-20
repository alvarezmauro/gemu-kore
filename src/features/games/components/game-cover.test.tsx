import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GameCover } from "./game-cover";
const cover = {
  url: "/api/media/private/release",
  alt: "Release artwork",
  width: 300,
  height: 400,
};
it("reserves a contained cover stage with a truthful absent-cover fallback", () => {
  render(<GameCover cover={null} />);
  expect(screen.getByText("No catalog cover available")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("falls back on delivery failure and tries again when the selected cover changes", () => {
  const view = render(<GameCover cover={cover} />);
  expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText("Cover image unavailable")).toBeVisible();
  view.rerender(
    <GameCover cover={{ ...cover, url: "/api/media/private/game-default" }} />,
  );
  expect(
    new URL((screen.getByRole("img") as HTMLImageElement).src).pathname,
  ).toBe("/api/media/private/game-default");
});
