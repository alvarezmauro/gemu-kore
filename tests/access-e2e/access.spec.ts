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

async function signIn(
  context: BrowserContext,
  role?: AccessRole,
  options: { email?: string; enabled?: boolean; verified?: boolean } = {},
) {
  const { email, token } = await fixture(
    "sign-in",
    JSON.stringify({ role, ...options }),
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

test("denies an initially disabled admin and still allows signout", async ({
  page,
  context,
}) => {
  const email = await signIn(context, "ADMIN", { enabled: false });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/access-denied$/);
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toHaveCount(0);
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await fixture("sessions")).toBe(0);
});

test("requires verified identity even with an enabled administrator grant", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN", { verified: false });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toHaveCount(0);
});

for (const state of ["expire", "revoke"] as const) {
  test(`loses private access when the current session is ${state === "expire" ? "expired" : "revoked"}`, async ({
    page,
    context,
  }) => {
    const email = await signIn(context, "ADMIN");
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Your collection" }),
    ).toBeVisible();
    await fixture(state, email);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Your collection" }),
    ).toHaveCount(0);
  });
}

test("rejects a tampered signed cookie despite the enabled grant", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN");
  const cookie = (await context.cookies()).find(
    (value) => value.name === "__Secure-gemukore.session_token",
  )!;
  await context.addCookies([{ ...cookie, value: `forged${cookie.value}` }]);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  expect(await fixture("sessions")).toBe(1);
});

for (const secondRole of ["VIEWER", undefined] as const) {
  test(`isolates admin access from a separate ${secondRole === "VIEWER" ? "viewer" : "ungranted"} browser`, async ({
    page,
    context,
    browser,
  }) => {
    await signIn(context, "ADMIN");
    const other = await browser.newContext({
      baseURL: "https://127.0.0.1:3111",
      ignoreHTTPSErrors: true,
      viewport: page.viewportSize(),
    });
    try {
      await signIn(other, secondRole, { email: "another-person@example.com" });
      const otherPage = await other.newPage();
      await otherPage.setExtraHTTPHeaders({
        "x-role": "ADMIN",
        "x-email": "browser-identity@example.com",
      });
      await Promise.all([page.goto("/app"), otherPage.goto("/app")]);
      await expect(page).toHaveURL(/\/app$/);
      await expect(
        page.getByText("Administrator", { exact: true }),
      ).toBeVisible();
      if (secondRole) {
        await expect(otherPage).toHaveURL(/\/app$/);
        await expect(
          otherPage.getByText("Viewer", { exact: true }),
        ).toBeVisible();
        await expect(
          otherPage.getByText("Administrator", { exact: true }),
        ).toHaveCount(0);
      } else {
        await expect(otherPage).toHaveURL(/\/access-denied$/);
        await expect(
          otherPage.getByRole("heading", { name: "Your collection" }),
        ).toHaveCount(0);
      }
      await page.reload();
      await expect(
        page.getByText("Administrator", { exact: true }),
      ).toBeVisible();
      expect(await fixture("sessions")).toBe(2);
    } finally {
      await other.close();
    }
  });
}
