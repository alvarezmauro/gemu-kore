// Physical-device test infrastructure only. Never imported by the application.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomInt, randomUUID, X509Certificate } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer, type Server } from "node:https";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "../src/server/db/generated/client";
import { signedSessionCookie } from "../tests/helpers/access-session";
import { modelBenchmark } from "../tests/helpers/model-benchmarks";
import { startTestMinio } from "../tests/helpers/setup-minio";
import { startTestPostgres } from "../tests/helpers/setup-postgres";

const exec = promisify(execFile);
const appPort = 3130;
const storagePort = 3132;
const devicePort = 3443;

async function close(server: Server | undefined) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

function relay(
  targetPort: number,
  incoming: import("node:http").IncomingMessage,
  outgoing: import("node:http").ServerResponse,
) {
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      method: incoming.method,
      path: incoming.url,
      headers: incoming.headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  upstream.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end();
  });
  outgoing.on("close", () => upstream.destroy());
  incoming.pipe(upstream);
}

async function main() {
  const host = process.argv[2];
  const ownAddress = Object.values(networkInterfaces())
    .flat()
    .some(
      (entry) =>
        entry?.family === "IPv4" && !entry.internal && entry.address === host,
    );
  if (
    !ownAddress ||
    !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host ?? "")
  )
    throw new Error("Pass this Mac's private Wi-Fi IPv4 address explicitly.");
  const origin = `https://${host}:${devicePort}`;
  const expiresAt = Date.now() + 90 * 60_000;
  const output = join(process.cwd(), "test-results/physical-device");
  const signal = new AbortController();
  const interrupt = () => signal.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const expiration = setTimeout(interrupt, 90 * 60_000);
  let database: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let storage: Awaited<ReturnType<typeof startTestMinio>> | undefined;
  let directory: string | undefined;
  let device: Server | undefined, storageProxy: Server | undefined;
  let app: ChildProcess | undefined;
  let prisma: PrismaClient | undefined;
  try {
    console.info(
      "Preparing disposable database and storage; development data stays separate.",
    );
    database = await startTestPostgres();
    signal.signal.throwIfAborted();
    storage = await startTestMinio();
    const s3 = new S3Client({
      endpoint: storage.config.endpoint,
      region: storage.config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: storage.config.accessKeyId,
        secretAccessKey: storage.config.secretAccessKey,
      },
    });
    try {
      await s3.send(new CreateBucketCommand({ Bucket: storage.config.bucket }));
    } finally {
      s3.destroy();
    }
    directory = await mkdtemp(join(tmpdir(), "gemukore-device-"));
    const key = join(directory, "key.pem"),
      certificate = join(directory, "certificate.pem");
    await exec("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${host}`,
      "-addext",
      `subjectAltName=IP:${host},IP:127.0.0.1`,
      "-keyout",
      key,
      "-out",
      certificate,
    ]);
    const cert = await readFile(certificate);
    const tls = { key: await readFile(key), cert };
    const storageEndpoint = new URL(storage.config.endpoint);
    storageProxy = createServer(tls, (incoming, outgoing) =>
      relay(Number(storageEndpoint.port), incoming, outgoing),
    );
    await new Promise<void>((resolve, reject) => {
      storageProxy!.once("error", reject);
      storageProxy!.listen(storagePort, "127.0.0.1", resolve);
    });
    const secret = randomUUID() + randomUUID();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: database.databaseUrl,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "device-fixture-only",
      GOOGLE_CLIENT_SECRET: "device-fixture-only",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      S3_ENDPOINT: `https://127.0.0.1:${storagePort}`,
      S3_REGION: storage.config.region,
      S3_BUCKET: storage.config.bucket,
      S3_ACCESS_KEY_ID: storage.config.accessKeyId,
      S3_SECRET_ACCESS_KEY: storage.config.secretAccessKey,
      S3_FORCE_PATH_STYLE: "true",
      NODE_EXTRA_CA_CERTS: certificate,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: database.databaseUrl }),
    });
    const email = "physical-device@example.com",
      token = randomUUID();
    const user = await prisma.user.create({
      data: { name: "Disposable device study", email, emailVerified: true },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(expiresAt),
      },
    });
    await prisma.accessGrant.create({
      data: { email, role: "EDITOR", enabled: true },
    });
    const platform = await prisma.consolePlatform.create({
      data: {
        name: "Synthetic performance studies",
        slug: "synthetic-studies",
      },
    });
    const studies: { kind: "plain" | "shiny" | "textured"; path: string }[] =
      [];
    for (const kind of ["plain", "shiny", "textured"] as const) {
      const model = await prisma.consoleModel.create({
        data: {
          name: `Synthetic ${kind} study`,
          slug: kind,
          platformId: platform.id,
        },
      });
      const copy = await prisma.collectionItem.create({
        data: {
          type: "CONSOLE",
          notes: "Original procedural test artwork. Disposable test data only.",
          ownedConsole: { create: { consoleModelId: model.id } },
        },
      });
      studies.push({ kind, path: `/app/consoles/${copy.id}` });
    }
    await mkdir(output, { recursive: true });
    console.info(
      "Building the production application for the isolated device study.",
    );
    try {
      const built = await exec("pnpm", ["build"], {
        env,
        timeout: 180_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      await writeFile(join(output, "build.log"), built.stdout + built.stderr);
    } catch {
      throw new Error("Device-study production build failed.");
    }
    signal.signal.throwIfAborted();
    app = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      { env, stdio: "ignore" },
    );
    app.once("error", interrupt);
    app.once("exit", interrupt);
    const deadline = Date.now() + 60_000;
    while (true) {
      signal.signal.throwIfAborted();
      try {
        if (
          (
            await fetch(`http://127.0.0.1:${appPort}/api/health`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          break;
      } catch {}
      if (Date.now() >= deadline)
        throw new Error("Device-study server readiness timed out.");
      await delay(250);
    }
    const cookie = signedSessionCookie(token, secret);
    let code = String(randomInt(10_000_000, 100_000_000));
    let entryExpires = Date.now() + 15 * 60_000;
    let claimed = false,
      ready = false,
      attempts = 0,
      attemptWindow = Date.now();
    const probe = await readFile("scripts/three-performance-probe.js");
    device = createServer(tls, async (incoming, outgoing) => {
      if (incoming.headers.host !== new URL(origin).host) {
        outgoing.writeHead(421);
        outgoing.end();
        return;
      }
      if (incoming.url?.startsWith("/__device/")) {
        outgoing.setHeader("Cache-Control", "no-store");
        // Native form posts need their same-origin Origin header. no-referrer
        // makes it null under the Fetch specification, even on the same origin.
        outgoing.setHeader("Referrer-Policy", "same-origin");
        outgoing.setHeader("X-Content-Type-Options", "nosniff");
        // Errors must render as text rather than an untyped download on iOS.
        outgoing.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (incoming.url === "/__device/start" && incoming.method === "GET") {
          outgoing.setHeader("Content-Type", "text/html; charset=utf-8");
          outgoing.end(
            '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>GemuKore device study</title><main style="font:20px system-ui;max-width:36rem;margin:3rem auto;padding:1rem"><h1>GemuKore device study</h1><p>Temporary test account and synthetic artwork only.</p><form method="post"><label>Connection code <input name="code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required></label><button>Open studies</button></form></main>',
          );
          return;
        }
        if (incoming.url === "/__device/start" && incoming.method === "POST") {
          if (Date.now() - attemptWindow > 60_000) {
            attemptWindow = Date.now();
            attempts = 0;
          }
          if (incoming.headers.origin !== origin) {
            outgoing.writeHead(403);
            outgoing.end(
              "Please reopen the connection page in Safari and submit its form.",
            );
            return;
          }
          if (!ready) {
            outgoing.writeHead(503);
            outgoing.end(
              "The device study is still being prepared. Try again shortly.",
            );
            return;
          }
          if (claimed) {
            outgoing.writeHead(409);
            outgoing.end(
              "This connection code has already been used. Request a fresh code.",
            );
            return;
          }
          if (Date.now() > entryExpires) {
            outgoing.writeHead(410);
            outgoing.end(
              "This connection code has expired. Request a fresh code.",
            );
            return;
          }
          if (++attempts > 5) {
            outgoing.writeHead(429, { "Retry-After": "60" });
            outgoing.end("Too many attempts. Wait one minute and try again.");
            return;
          }
          let body = "";
          try {
            for await (const chunk of incoming) {
              body += chunk;
              if (body.length > 128) throw new Error();
            }
          } catch {
            outgoing.writeHead(400);
            outgoing.end("The submitted form is invalid.");
            return;
          }
          if (new URLSearchParams(body).get("code") !== code) {
            outgoing.writeHead(403);
            outgoing.end("Incorrect code.");
            return;
          }
          claimed = true;
          outgoing.setHeader(
            "Set-Cookie",
            `__Secure-gemukore.session_token=${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax`,
          );
          outgoing.writeHead(303, { Location: "/__device/studies" });
          outgoing.end();
          return;
        }
        const authenticated = incoming.headers.cookie
          ?.split(/;\s*/)
          .includes(`__Secure-gemukore.session_token=${cookie}`);
        if (!authenticated) {
          outgoing.writeHead(403);
          outgoing.end(
            "Open the connection page and enter a valid connection code first.",
          );
          return;
        }
        if (incoming.url === "/__device/studies" && incoming.method === "GET") {
          outgoing.setHeader("Content-Type", "text/html; charset=utf-8");
          outgoing.end(
            `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>GemuKore studies</title><main style="font:20px system-ui;max-width:36rem;margin:3rem auto;padding:1rem"><h1>Device studies</h1><p>This session expires when the temporary server stops.</p><ul>${studies.map((study) => `<li style="margin:1.5rem 0"><a href="${study.path}">${study.kind} synthetic model</a></li>`).join("")}</ul></main>`,
          );
          return;
        }
        if (
          incoming.url === "/__device/probe.js" &&
          incoming.method === "GET"
        ) {
          outgoing.setHeader("Content-Type", "text/javascript; charset=utf-8");
          outgoing.end(probe);
          return;
        }
        outgoing.writeHead(404);
        outgoing.end();
        return;
      }
      relay(appPort, incoming, outgoing);
    });
    await new Promise<void>((resolve, reject) => {
      device!.once("error", reject);
      device!.listen(devicePort, host, resolve);
    });
    console.info(
      "Preparing all three models through the normal authenticated upload flow.",
    );
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        baseURL: origin,
        ignoreHTTPSErrors: true,
      });
      await context.addCookies([
        {
          name: "__Secure-gemukore.session_token",
          value: cookie,
          url: origin,
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      for (const study of studies) {
        await page.goto(study.path);
        await page.getByLabel("File purpose").selectOption("CUSTOM_MODEL");
        await page
          .getByLabel("Choose override file", { exact: true })
          .setInputFiles({
            name: `${study.kind}.glb`,
            mimeType: "model/gltf-binary",
            buffer: modelBenchmark(study.kind).bytes,
          });
        await page
          .getByRole("button", { name: "Upload file", exact: true })
          .click();
        const model = page
          .getByRole("list", { name: "Copy overrides" })
          .getByRole("listitem")
          .filter({ hasText: `${study.kind}.glb` });
        await expect(model).toBeVisible({ timeout: 30_000 });
        await model
          .getByRole("button", { name: "Use for this copy", exact: true })
          .click();
        await expect(
          page.getByRole("region", { name: "3D preview", exact: true }),
        ).toBeVisible();
      }
      await prisma.accessGrant.update({
        where: { email },
        data: { role: "VIEWER" },
      });
      await page.reload();
      await expect(
        page.getByRole("region", { name: "3D preview", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Upload file", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "View in 3D", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "3D preview ready" }),
      ).toBeVisible({ timeout: 20_000 });
      const denied = await context.request.get("/__device/studies", {
        headers: { Cookie: "" },
      });
      if (denied.status() !== 403)
        throw new Error("Device-study gate check failed.");
      const privatePage = await context.request.get(studies[0].path, {
        headers: { Cookie: "" },
        maxRedirects: 0,
      });
      if (
        privatePage.status() !== 307 ||
        privatePage.headers().location !== "/login"
      )
        throw new Error(
          "Device-study private-page authorization check failed.",
        );
    } finally {
      await browser.close();
    }
    // Exercise the real browser form, including Origin, redirects and cookies.
    // API-only POST checks would miss the native form's referrer-policy behavior.
    ready = true;
    const entryBrowser = await chromium.launch();
    try {
      const context = await entryBrowser.newContext({
        baseURL: origin,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      await page.goto("/__device/start");
      await page.locator("input[name=code]").fill("00000000");
      await page
        .getByRole("button", { name: "Open studies", exact: true })
        .click();
      await expect(page.locator("body")).toContainText("Incorrect code.");
      await page.goto("/__device/start");
      await page.locator("input[name=code]").fill(code);
      await page
        .getByRole("button", { name: "Open studies", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Device studies", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link")).toHaveCount(3);
      await page
        .getByRole("link", { name: "plain synthetic model", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "3D preview", exact: true }),
      ).toBeVisible();
      const replay = await context.request.post("/__device/start", {
        headers: { Origin: origin },
        form: { code },
      });
      if (
        replay.status() !== 409 ||
        !replay.headers()["content-type"]?.startsWith("text/plain")
      )
        throw new Error("Device-study one-use entry check failed.");
      const foreign = await context.request.post("/__device/start", {
        headers: { Origin: "https://example.invalid" },
        form: { code },
      });
      if (foreign.status() !== 403)
        throw new Error("Device-study origin check failed.");
    } finally {
      await entryBrowser.close();
    }
    // Discard the verification code so only the fresh phone code is usable.
    code = String(randomInt(10_000_000, 100_000_000));
    claimed = false;
    attempts = 0;
    attemptWindow = Date.now();
    entryExpires = Date.now() + 15 * 60_000;
    await writeFile(
      join(output, "connection.json"),
      JSON.stringify(
        {
          origin,
          start: `${origin}/__device/start`,
          code,
          certificateSha256: new X509Certificate(cert).fingerprint256,
          studies,
          expiresAt: new Date(expiresAt).toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.info(
      `Device study ready at ${origin}/__device/start. Connection details are in test-results/physical-device/connection.json. Stops automatically after 90 minutes.`,
    );
    if (!signal.signal.aborted)
      await new Promise<void>((resolve) =>
        signal.signal.addEventListener("abort", () => resolve(), {
          once: true,
        }),
      );
  } finally {
    clearTimeout(expiration);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await close(device);
    await close(storageProxy);
    await stop(app);
    await prisma?.$disconnect();
    if (directory) await rm(directory, { recursive: true, force: true });
    try {
      await storage?.cleanup();
    } finally {
      await database?.cleanup();
    }
    await rm(join(output, "connection.json"), { force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Device-study setup failed.",
  );
  process.exitCode = 1;
});
