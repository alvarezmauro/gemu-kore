import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { startTestPostgres } from "./setup-postgres";

const exec = promisify(execFile);
async function main() {
  const database = await startTestPostgres();
  let directory: string | undefined;
  let proxy: ReturnType<typeof createServer> | undefined;

  try {
    directory = await mkdtemp(join(tmpdir(), "gemukore-access-browser-"));
    // Test-only TLS lets the actual production Secure session cookie work.
    const key = join(directory, "key.pem");
    const certificate = join(directory, "certificate.pem");
    await exec("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-keyout",
      key,
      "-out",
      certificate,
    ]);
    proxy = createServer(
      { key: await readFile(key), cert: await readFile(certificate) },
      (incoming, outgoing) => {
        const upstream = request(
          {
            hostname: "127.0.0.1",
            port: 3110,
            path: incoming.url,
            method: incoming.method,
            headers: incoming.headers,
          },
          (response) => {
            outgoing.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(outgoing);
          },
        );
        upstream.on("error", () => {
          outgoing.writeHead(502);
          outgoing.end();
        });
        incoming.pipe(upstream);
      },
    );
    await new Promise<void>((resolve, reject) => {
      proxy!.once("error", reject);
      proxy!.listen(3111, "127.0.0.1", resolve);
    });
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "--config",
          "playwright.access.config.ts",
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            DATABASE_URL: database.databaseUrl,
            BETTER_AUTH_URL: "https://127.0.0.1:3111",
            BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
            GOOGLE_CLIENT_ID: "access-browser-test",
            GOOGLE_CLIENT_SECRET: "access-browser-test",
            GITHUB_CLIENT_ID: "",
            GITHUB_CLIENT_SECRET: "",
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      );
      child.once("error", reject);
      child.once("exit", (status) => resolve(status ?? 1));
    });
    process.exitCode = code;
  } finally {
    try {
      if (proxy?.listening) {
        proxy.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          proxy!.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        await database.cleanup();
      }
    }
  }
}

void main().catch(() => {
  console.error(
    "Access browser setup failed. Check Docker, OpenSSL and test port availability.",
  );
  process.exitCode = 1;
});
