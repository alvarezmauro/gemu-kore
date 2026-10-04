import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LoginControls } from "./login-controls";

const social = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({ authClient: { signIn: { social } } }));
beforeEach(() => social.mockReset());

it("keeps both providers unavailable when authentication has no configuration", () => {
  render(
    <LoginControls
      providers={{ google: false, github: false }}
      loginFailed={false}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeDisabled();
  expect(social).not.toHaveBeenCalled();
});

it("prevents duplicate starts and uses the private entry instead of a user-supplied redirect", async () => {
  let finish!: (result: { error: null }) => void;
  social.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <LoginControls
      providers={{ google: true, github: true }}
      loginFailed={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(
    screen.getByRole("button", { name: "Opening sign-in…" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeDisabled();
  expect(social).toHaveBeenCalledWith({
    provider: "google",
    callbackURL: "/app",
    errorCallbackURL: "/login",
    newUserCallbackURL: "/app",
  });
  finish({ error: null });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeEnabled(),
  );
});

it("makes failure retryable without rendering provider error details", async () => {
  social.mockResolvedValue({ error: { message: "private-provider-response" } });
  render(
    <LoginControls
      providers={{ google: true, github: true }}
      loginFailed={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "We couldn't start sign-in.",
  );
  expect(
    screen.queryByText("private-provider-response"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeEnabled();
});
