import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "./page";

it("introduces the design preview inside the main page landmark", () => {
  render(<HomePage />);

  const main = within(screen.getByRole("main"));
  expect(
    main.getByRole("heading", { level: 1, name: "GemuKore" }),
  ).toBeVisible();
  expect(
    main.getByText("A home for your gaming collection.", { exact: false }),
  ).toBeVisible();
});
