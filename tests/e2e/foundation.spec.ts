import { expect, test } from "@playwright/test";

test("the design preview renders without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("GemuKore");
  await expect(
    page.getByRole("main").getByRole("heading", {
      level: 1,
      name: "GemuKore",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("A home for your gaming collection.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("public health responds without exposing infrastructure details", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
