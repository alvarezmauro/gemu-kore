import { expect, test } from "@playwright/test";

test("form feedback is associated with fields and examples remain unsaved", async ({
  page,
}) => {
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Name (required)" });
  const notes = page.getByRole("textbox", { name: "Notes", exact: true });
  await page.getByRole("button", { name: "Check example" }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/Enter a name/);
  await name.fill("My sample game");
  await notes.fill("x".repeat(301));
  await page.getByRole("button", { name: "Check example" }).click();
  await expect(notes).toHaveAccessibleDescription(/300 characters or fewer/);
  await notes.fill("An illustrative note");
  await page.getByRole("button", { name: "Check example" }).click();
  await expect(
    page.getByText("Preview complete. Nothing has been saved."),
  ).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "false");
  await expect(notes).toHaveValue("An illustrative note");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(name).toHaveValue("");
  await expect(notes).toHaveValue("");
  await expect(
    page.getByText("Preview complete. Nothing has been saved."),
  ).toHaveCount(0);
  await name.fill("Temporary example");
  await page.reload();
  await expect(name).toHaveValue("");
});

test("compact navigation traps focus, closes with Escape and closes after navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "GemuKore" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("animation-name", "none");
  // Radix deliberately focuses the close control rather than a navigation link.
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("link", { name: "Overview" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Forms", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#forms$/);
  await expect(
    page.getByRole("heading", { name: "Simple, readable forms" }),
  ).toBeInViewport();
});

test("small screens and zoom-sized layouts stay usable in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  for (const theme of ["Light", "Dark"] as const) {
    await page.getByRole("button", { name: "Choose theme" }).click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { level: 1, name: "GemuKore" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]').first()).toHaveCSS(
      "animation-name",
      "none",
    );
  }
  // A 1280px desktop at 200% zoom has an effective 640px CSS viewport.
  await page.setViewportSize({ width: 640, height: 480 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Control+Home");
});

test("the skip link moves keyboard focus to the main content", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
