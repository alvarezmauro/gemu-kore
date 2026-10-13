import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { startTestMinio } from "./setup-minio";
import { startTestPostgres } from "./setup-postgres";

const exec = promisify(execFile);
async function main() {
  const database = await startTestPostgres();
  let storage: Awaited<ReturnType<typeof startTestMinio>> | undefined;
  let storageProxy: ReturnType<typeof createServer> | undefined;
  let directory: string | undefined;
  let proxy: ReturnType<typeof createServer> | undefined;

  try {
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
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
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
    // Production keeps its HTTPS-only storage policy. This test-only TLS proxy
    // forwards to disposable MinIO, with a locally trusted one-day certificate.
    const endpoint = new URL(storage.config.endpoint);
    storageProxy = createServer(
      { key: await readFile(key), cert: await readFile(certificate) },
      (incoming, outgoing) => {
        const upstream = request(
          {
            hostname: endpoint.hostname,
            port: endpoint.port,
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
      storageProxy!.once("error", reject);
      storageProxy!.listen(3112, "127.0.0.1", resolve);
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
          ...process.argv.slice(2),
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
            S3_ENDPOINT: "https://127.0.0.1:3112",
            S3_REGION: storage!.config.region,
            S3_BUCKET: storage!.config.bucket,
            S3_ACCESS_KEY_ID: storage!.config.accessKeyId,
            S3_SECRET_ACCESS_KEY: storage!.config.secretAccessKey,
            S3_FORCE_PATH_STYLE: "true",
            NODE_EXTRA_CA_CERTS: certificate,
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
      if (storageProxy?.listening) {
        storageProxy.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          storageProxy!.close((error) => (error ? reject(error) : resolve())),
        );
      }
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
        try {
          await storage?.cleanup();
        } finally {
          await database.cleanup();
        }
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
