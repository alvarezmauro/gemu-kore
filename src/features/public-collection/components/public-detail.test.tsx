import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./public-viewer", () => ({
  PublicViewer: () => <p>On-demand viewer</p>,
}));
import { PublicDetail } from "./public-detail";
import { PublicImage } from "./public-image";
import type { PublicDetail as Detail } from "../contracts";
const item: Detail = {
  id: "copy",
  type: "GAME",
  title: "A preserved game",
  context: "Platform · Edition",
  href: "/collection/games/copy",
  hasBox: null,
  identificationStatus: "INCOMPLETE",
  photo: null,
  description: "<script>plain text</script>",
  facts: [{ label: "Expected content", value: "Manual × 1" }],
  markets: ["Europe"],
  relatedTruncated: false,
};
it("renders complete static copy/catalog context without hidden sections, private controls or automatic 3D", () => {
  const html = renderToStaticMarkup(<PublicDetail item={item} />);
  expect(html).toContain("Catalog information");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("Box status unknown");
  expect(html).not.toMatch(
    /Serial number|Location|Collection notes|Recorded defects|canvas|iframe|api\/media\/private|On-demand viewer/,
  );
  render(<PublicDetail item={item} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    item.title,
  );
  expect(screen.getByRole("link", { name: "Back to games" })).toHaveAttribute(
    "href",
    "/collection/games",
  );
});
it("shows only supplied optional fields and describes an empty defect list honestly", () => {
  render(
    <PublicDetail
      item={{
        ...item,
        serialNumber: "000012",
        notes: "Approved note",
        location: null,
        defects: { items: [], hasMore: false },
        model: true,
      }}
    />,
  );
  expect(screen.getByText("000012")).toBeVisible();
  expect(
    screen.getByText("No defects recorded. This is not a condition guarantee."),
  ).toBeVisible();
  expect(screen.getByText("On-demand viewer")).toBeVisible();
});
it("preserves a neutral fallback when approved image delivery fails", () => {
  render(
    <PublicImage
      image={{
        url: "/api/media/public/items/id/catalog/use",
        alt: "Public photo",
        caption: null,
        source: "Catalog artwork",
        width: 80,
        height: 60,
      }}
    />,
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("status")).toHaveTextContent("Image unavailable");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
