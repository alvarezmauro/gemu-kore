import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TrailerPlayer } from "./trailer-player";
const trailer = { provider: "YOUTUBE" as const, id: "AbCdEf123_-" };
it("renders a no-JS external fallback and adds the fixed YouTube player only on request", async () => {
  const { container } = render(
    <TrailerPlayer trailer={trailer} title="Chrono Trigger trailer" />,
  );
  expect(container.querySelector("iframe")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Watch on YouTube" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=AbCdEf123_-");
  fireEvent.click(screen.getByRole("button", { name: "Load trailer" }));
  const frame = await screen.findByTitle("Chrono Trigger trailer");
  expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/AbCdEf123_-?playsinline=1",
  );
  expect(frame).toHaveAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close trailer" }));
  expect(container.querySelector("iframe")).toBeNull();
});
it("defers native video loading, keeps controls and reports direct-video errors", async () => {
  const { container } = render(
    <TrailerPlayer
      trailer={{ provider: "DIRECT_URL", url: "https://example.com/video.mp4" }}
      title="Direct trailer"
    />,
  );
  expect(container.querySelector("video")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load trailer" }));
  const video = await screen.findByLabelText("Direct trailer");
  expect(video).toHaveAttribute("controls");
  expect(video).toHaveAttribute("preload", "none");
  expect(video).not.toHaveAttribute("autoplay");
  fireEvent.error(video);
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(
    screen.getByRole("link", { name: "Open original video" }),
  ).toBeVisible();
});
it("handles unknown or unsafe legacy references without an executable link", () => {
  const { container } = render(
    <TrailerPlayer trailer={null} title="Unknown" />,
  );
  expect(screen.getByText("No trailer recorded.")).toBeVisible();
  expect(container.querySelector("a,iframe,video")).toBeNull();
});
it("uses product video controls while preserving explicit activation and safe fallback", async () => {
  const { container } = render(
    <TrailerPlayer trailer={trailer} title="Accessory video" kind="video" />,
  );
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load video" }));
  expect(await screen.findByTitle("Accessory video")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/AbCdEf123_-?playsinline=1",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close video" }));
  expect(container.querySelector("iframe")).toBeNull();
});
