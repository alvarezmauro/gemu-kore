import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
function send(port, method, path) {
  return new Promise((accept, reject) => {
    const req = request({ hostname: "127.0.0.1", port, method, path });
    req.setTimeout(5000, () => req.destroy(new Error("Proxy test timeout")));
    req.on("error", reject);
    req.on("response", (response) => {
      response.resume();
      response.once("end", () => accept(response.statusCode));
    });
    req.on("connect", (response, socket) => {
      socket.destroy();
      accept(response.statusCode);
    });
    req.end();
  });
}

test("production proxy admits object transport and rejects unused control surfaces before upstream dispatch", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gemukore-proxy-test-"));
  // This fixture contains public configuration only; restricted Caddy must read it.
  await chmod(directory, 0o755);
  const name = `gemukore-proxy-test-${randomUUID()}`;
  const compose = await readFile("docker-compose.production.yml", "utf8");
  const image = /^\s+image: (caddy:\S+)$/m.exec(compose)?.[1];
  assert.ok(image?.includes("@sha256:"));
  let created = false;
  try {
    await writeFile(
      join(directory, "routes.caddy"),
      await readFile("docker/proxy/routes.caddy"),
    );
    await writeFile(
      join(directory, "Caddyfile"),
      `{
  admin off
  auto_https off
}
import /test/routes.caddy
http://:8080 {
  import app_routes
}
http://:8081 {
  import storage_routes
}
http://:8082 {
  respond /ready 204
}
`,
    );
    await exec("docker", [
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      "gemukore.test=true",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "NET_BIND_SERVICE",
      "--security-opt",
      "no-new-privileges:true",
      "--tmpfs",
      "/data",
      "--tmpfs",
      "/config",
      "--add-host",
      "app:127.0.0.1",
      "--add-host",
      "garage1:127.0.0.1",
      "--add-host",
      "garage2:127.0.0.1",
      "--add-host",
      "garage3:127.0.0.1",
      "--env",
      "S3_BUCKET=gemukore-proxy-test",
      "--publish",
      "127.0.0.1::8080",
      "--publish",
      "127.0.0.1::8081",
      "--publish",
      "127.0.0.1::8082",
      "--volume",
      `${directory}:/test:ro`,
      image,
      "caddy",
      "run",
      "--config",
      "/test/Caddyfile",
      "--adapter",
      "caddyfile",
    ]);
    created = true;
    const port = async (internal) => {
      const { stdout } = await exec("docker", [
        "port",
        name,
        `${internal}/tcp`,
      ]);
      const match = /^127\.0\.0\.1:(\d+)\s*$/.exec(stdout);
      assert.ok(match);
      return Number(match[1]);
    };
    const app = await port(8080),
      storage = await port(8081),
      ready = await port(8082);
    const deadline = Date.now() + 15000;
    while (true) {
      try {
        if ((await send(ready, "GET", "/ready")) === 204) break;
      } catch {}
      if (Date.now() >= deadline) throw new Error("Proxy did not start");
      await setTimeout(100);
    }
    for (const [method, path] of [
      ["CONNECT", "example.invalid:443"],
      ["TRACE", "/api/health"],
    ])
      await t.test(`application rejects ${method}`, async () => {
        assert.equal(await send(app, method, path), 405);
      });
    const key =
      "/gemukore-proxy-test/assets/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png";
    for (const [method, path] of [
      ["POST", key],
      ["PATCH", key],
      ["TRACE", key],
      ["PUT", "/gemukore-proxy-test?lifecycle"],
      ["PUT", "/gemukore-proxy-test?cors"],
      ["GET", "/gemukore-proxy-test?list-type=2"],
      ["POST", `${key}?uploads`],
      ["PUT", `${key}?tagging`],
      ["GET", `${key}?x-id=GetObject&lifecycle`],
      ["GET", `${key}?x-id=GetObject&x-id=GetObject`],
      ["GET", `${key}?%6cifecycle`],
      ["GET", key.replace("/gemukore-proxy-test/", "/other-bucket/")],
      ["GET", "/gemukore-proxy-test/private/file.png"],
    ])
      await t.test(`storage rejects ${method} ${path}`, async () => {
        assert.equal(await send(storage, method, path), 404);
      });
    // Closed loopback upstreams return 502, or 503 once all are marked down.
    // The full production rehearsal separately verifies signed real byte flows.
    for (const [method, query] of [
      ["GET", ""],
      ["GET", "?x-id=GetObject"],
      ["HEAD", "?x-id=HeadObject"],
      ["PUT", "?x-id=PutObject"],
      ["DELETE", "?x-id=DeleteObject"],
    ])
      await t.test(`storage dispatches ${method} ${query}`, async () => {
        assert.ok(
          [502, 503].includes(await send(storage, method, key + query)),
        );
      });
  } catch (error) {
    if (created) {
      const logs = await exec("docker", ["logs", name]);
      throw new Error(`Proxy fixture failed: ${logs.stdout}${logs.stderr}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (created) await exec("docker", ["rm", "--force", "--volumes", name]);
    await rm(directory, { recursive: true, force: true });
  }
});
