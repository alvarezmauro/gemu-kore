import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DashboardUnavailable } from "./dashboard-unavailable";
vi.mock("@/features/auth/components/sign-out-button", () => ({
  SignOutButton: () => <button>Sign out</button>,
}));
it("shows a retry without presenting failed counts as an empty collection", () => {
  const { container } = render(<DashboardUnavailable />);
  expect(
    screen.getByRole("heading", { name: "Overview unavailable" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/app",
  );
  expect(container.querySelector("[data-number-ticker]")).toBeNull();
  expect(
    screen.queryByText("Your collection starts here"),
  ).not.toBeInTheDocument();
});
