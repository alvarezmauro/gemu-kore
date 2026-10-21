import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ScreenshotGallery } from "./screenshot-gallery";
import type { ScreenshotGalleryData } from "../screenshot-contracts";
vi.mock("@/components/magic/blur-fade", () => ({
  BlurFade: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
const gallery: ScreenshotGalleryData = {
  page: 1,
  hasNext: false,
  scope: "release",
  canManage: false,
  items: ["Forest", "Castle"].map((caption, i) => ({
    id: String(i),
    caption,
    altText: `Scene ${i + 1}`,
    url: `/api/media/private/${i}`,
    width: 800,
    height: 600,
    source: {
      type: "CURATED",
      provider: "Manual source",
      url: "https://example.com/shot",
      author: "Artist",
      licenseName: null,
      licenseUrl: null,
      attribution: null,
      restrictions: null,
      retrievedAt: null,
    },
  })),
};
it("keeps original private image links, opens a keyboard viewer, and restores trigger focus", async () => {
  render(<ScreenshotGallery gallery={gallery} />);
  const trigger = screen.getByRole("link", { name: "View screenshot 1" });
  expect(trigger).toHaveAttribute("href", "/api/media/private/0");
  fireEvent.click(trigger);
  await screen.findByRole("dialog");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  expect(screen.getByRole("heading", { name: "Screenshot 2" })).toBeVisible();
  expect(
    screen.getByRole("dialog").querySelector('[alt="Scene 1"]'),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close screenshot" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
it("labels inherited screenshots and preserves useful empty/paginated states", () => {
  const view = render(
    <ScreenshotGallery
      gallery={{ ...gallery, scope: "game", items: [] }}
      next="/next"
    />,
  );
  expect(screen.getByText(/Game-level screenshots/)).toBeVisible();
  expect(screen.getByText("No screenshots recorded.")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "More screenshots" }),
  ).toHaveAttribute("href", "/next");
  view.rerender(<ScreenshotGallery gallery={gallery} />);
  fireEvent.click(screen.getAllByText("Screenshot source details")[0]);
  expect(screen.getAllByText("Author: Artist")[0]).toBeVisible();
});
