import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
const exec = promisify(execFile);
async function fixture(command: string, argument?: string) {
  const { stdout } = await exec(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(argument ? [argument] : []),
    ],
    { env: process.env, timeout: 10_000 },
  );
  return JSON.parse(stdout.trim());
}
test.beforeEach(async () => {
  await fixture("reset-defects");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-defects");
  await fixture("reset");
});
for (const route of ["media", "defects"]) {
  test(`pages and searches copy choices on ${route} while preserving a direct selection`, async ({
    page,
    context,
  }, info) => {
    if (info.project.name === "mobile-chromium")
      await page.setViewportSize({ width: 320, height: 740 });
    const { token } = await fixture(
      "sign-in",
      JSON.stringify({ role: "EDITOR" }),
    );
    await context.addCookies([
      {
        name: "__Secure-gemukore.session_token",
        value: signedSessionCookie(token, process.env.BETTER_AUTH_SECRET!),
        url: "https://127.0.0.1:3111",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const { lastId, firstId } = await fixture("seed-defect-items", "paged");
    await page.goto(`/app/${route}?itemId=${lastId}`);
    const select = page.getByLabel("Collection copy", { exact: true });
    await expect(select).toHaveValue(lastId);
    await expect(select.locator("option")).toHaveCount(26);
    await page
      .getByRole("button", { name: "More copies", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Page 2" }),
    ).toBeVisible();
    await expect(select).toHaveValue(lastId);
    await page
      .getByRole("button", { name: "More copies", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Page 3" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More copies", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Search copies", { exact: true })
      .fill("no such private title");
    await page.getByLabel("Search copies", { exact: true }).press("Enter");
    await expect(page.getByText(/No matching copies/)).toBeVisible();
    expect(page.url()).not.toContain("private");
    await expect(select).toHaveValue(lastId);
    await page.getByLabel("Search copies", { exact: true }).fill(firstId);
    await page
      .getByRole("button", { name: "Find copies", exact: true })
      .click();
    await expect(select.locator(`option[value="${firstId}"]`)).toHaveCount(1);
    await select.selectOption(firstId);
    await select.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "View copy", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/app/${route}\\?itemId=${firstId}$`),
    );
    await expect(select).toHaveValue(firstId);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${route}-choices.png`),
      fullPage: true,
    });
  });
}

for (const route of ["media", "defects"]) {
  test(`browses later copy pages without JavaScript on ${route}`, async ({
    browser,
  }) => {
    const { token } = await fixture(
      "sign-in",
      JSON.stringify({ role: "VIEWER" }),
    );
    const { lastId } = await fixture("seed-defect-items", "paged");
    const context = await browser.newContext({
      javaScriptEnabled: false,
      ignoreHTTPSErrors: true,
      viewport: { width: 320, height: 740 },
    });
    try {
      await context.addCookies([
        {
          name: "__Secure-gemukore.session_token",
          value: signedSessionCookie(token, process.env.BETTER_AUTH_SECRET!),
          url: "https://127.0.0.1:3111",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.goto(`https://127.0.0.1:3111/app/${route}?itemId=${lastId}`);
      await expect(page.getByLabel("Search copies")).toBeDisabled();
      await page
        .getByRole("button", { name: "More copies", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`itemId=${lastId}&copyPage=1$`));
      await expect(
        page.getByLabel("Collection copy", { exact: true }),
      ).toHaveValue(lastId);
      await expect(
        page.getByRole("status").filter({ hasText: "Page 2" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "More copies", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Page 3" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "More copies", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Previous copies", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Page 2" }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
