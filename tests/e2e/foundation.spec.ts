import { expect, test } from "@playwright/test";

test("the design preview renders without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/design-preview");
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

test("root redirects consistently and an unavailable database gives a generic uncached public home", async ({
  page,
  request,
}) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/collection");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const home = await page.goto("/collection");
  expect(home?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The collection is unavailable right now.",
  );
  const html = await home!.text();
  expect(html).not.toContain("postgresql://");
  expect(html).not.toContain("gemukore_e2e");
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
});
