import { expect, test } from "@playwright/test";

test("sign-in renders safely without provider credentials", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to GemuKore" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Sign-in hasn't been set up yet.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("private entry redirects to sign-in and ignores an external return path", async ({
  page,
}) => {
  await page.goto("/app?returnTo=https://untrusted.example");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to GemuKore" }),
  ).toBeVisible();
});

test("private locations redirect to sign-in without exposing hierarchy data", async ({
  page,
}) => {
  await page.goto("/app/locations");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("list", { name: "Location hierarchy" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add location" })).toHaveCount(
    0,
  );
});

test("callback errors render a generic retry message", async ({ page }) => {
  await page.goto(
    "/login?error=provider_rejected&error_description=private-provider-details",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "We couldn't complete sign-in.",
  );
  await expect(page.getByText("private-provider-details")).toHaveCount(0);
});

test("denial offers recovery without displaying identity or collection data", async ({
  page,
}) => {
  await page.goto("/access-denied");
  await expect(
    page.getByRole("heading", { name: "Access unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("auth endpoint reports missing configuration without secrets or credentials", async ({
  request,
}) => {
  const response = await request.post("/api/auth/sign-in/social", {
    data: { provider: "google" },
  });
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({
    error: "Sign-in is not configured.",
  });
});
