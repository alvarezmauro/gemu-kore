import { expect, test } from "@playwright/test";

test("explicit theme choices change the colors and survive a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  const trigger = page.getByRole("button", { name: "Choose theme" });
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);
  const lightBackground = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);

  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(html).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await expect
    .poll(() =>
      page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor),
    )
    .not.toBe(lightBackground);

  await page.reload();
  await expect(html).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await trigger.click();
  await expect(
    page.getByRole("menuitemradio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);
  await page.reload();
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);
});

test("system mode follows the device while explicit preferences take priority", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  const trigger = page.getByRole("button", { name: "Choose theme" });
  await expect(html).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await trigger.click();
  await expect(
    page.getByRole("menuitemradio", { name: "System", exact: true }),
  ).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);

  await trigger.click();
  await page
    .getByRole("menuitemradio", { name: "System", exact: true })
    .click();
  await expect(html).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveClass(/(?:^|\s)light(?:\s|$)/);
});

test("the theme menu supports keyboard selection and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Choose theme" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("menuitemradio", { name: "Light", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "Dark", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
