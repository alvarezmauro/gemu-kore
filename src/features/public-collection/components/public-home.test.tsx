import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicHome } from "./public-home";
import type { PublicHome as HomeData } from "../contracts";

const data: HomeData = {
  state: "public",
  name: "A personal museum",
  description: "Objects worth keeping.",
  counts: { total: 1, consoles: 0, games: 1, accessories: 0, boxed: 0 },
  recent: [
    {
      id: "public-copy",
      type: "GAME",
      title: "A physical game",
      context: "Cartridge · Europe",
      href: "/collection/games/public-copy",
      hasBox: null,
      identificationStatus: "INCOMPLETE",
      photo: null,
    },
  ],
};
it("renders complete static exhibit text and real counts without exposing unavailable destinations or media", () => {
  const html = renderToStaticMarkup(<PublicHome data={data} />);
  expect(html).toContain("A physical game");
  expect(html).toContain("Objects worth keeping.");
  expect(html).not.toContain('href="/collection/games/');
  expect(html).not.toContain("/api/media");
  expect(html).not.toContain("<canvas");
  render(<PublicHome data={data} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "A personal museum",
  );
  expect(
    within(
      screen.getByRole("list", { name: "Recently added objects" }),
    ).getAllByRole("listitem"),
  ).toHaveLength(1);
  expect(screen.queryByText("Box included")).not.toBeInTheDocument();
  expect(screen.getByText("Identification incomplete")).toBeVisible();
});
it("keeps disabled and enabled-empty states distinct", () => {
  const { rerender, container } = render(
    <PublicHome
      data={{
        state: "private",
        message: "This collection is currently private.",
      }}
    />,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "This collection is currently private.",
  );
  expect(container.querySelector("[data-number-ticker]")).toBeNull();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  rerender(
    <PublicHome
      data={{
        ...data,
        counts: { total: 0, consoles: 0, games: 0, accessories: 0, boxed: 0 },
        recent: [],
      }}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "The shelves are waiting" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Step inside" }),
  ).not.toBeInTheDocument();
  expect(
    container.querySelectorAll("[data-number-ticker] > .sr-only"),
  ).toHaveLength(4);
});
