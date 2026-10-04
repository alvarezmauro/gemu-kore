import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext } from "@playwright/test";
import type { AccessRole } from "../../src/features/auth/contracts";
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
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset");
});

async function signIn(context: BrowserContext, role?: AccessRole) {
  const { email, token } = await fixture("sign-in", role);
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
  return email;
}

for (const [role, label] of [
  ["ADMIN", "Administrator"],
  ["EDITOR", "Editor"],
  ["VIEWER", "Viewer"],
] as const) {
  test(`allows the current enabled ${role} grant`, async ({
    page,
    context,
  }) => {
    await signIn(context, role);
    const response = await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Your collection" }),
    ).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByText("browser-identity@example.com")).toHaveCount(0);
  });
}

test("denies identity without a grant even with forged role/email headers", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setExtraHTTPHeaders({
    "x-role": "ADMIN",
    "x-email": "admin@example.com",
  });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/access-denied$/);
});

test("reads role, disabled and deleted grants again for the same browser session", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN");
  await page.goto("/app");
  await expect(page.getByText("Administrator", { exact: true })).toBeVisible();
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.reload();
  await expect(page.getByText("Viewer", { exact: true })).toBeVisible();
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.reload();
  await expect(page).toHaveURL(/\/access-denied$/);
  await fixture("update", JSON.stringify({ enabled: true }));
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await fixture("delete");
  await page.reload();
  await expect(page).toHaveURL(/\/access-denied$/);
  expect(await fixture("sessions")).toBe(1);
});

test("signs out through the real auth route and removes private access", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN");
  await page.goto("/app");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await fixture("sessions")).toBe(0);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
