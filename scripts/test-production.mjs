import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";

const exec = promisify(execFile);
const project = `gemukore-production-test-${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), `${project}-`));
await chmod(directory, 0o755); // Containers read only the explicitly mounted files.
const envFile = join(directory, "test.env");
const override = join(directory, "compose.json");
const secret = () => randomBytes(32).toString("hex");
const values = {
  APP_DOMAIN: "127.0.0.1",
  STORAGE_DOMAIN: "storage.test",
  ACME_EMAIL: "operator@example.invalid",
  PROXY_BIND_ADDRESS: "127.0.0.1",
  HTTP_PORT: "3110",
  HTTPS_PORT: "3111",
  POSTGRES_DB: "gemukore_test",
  POSTGRES_ADMIN_PASSWORD: secret(),
  POSTGRES_MIGRATOR_PASSWORD: secret(),
  POSTGRES_APP_PASSWORD: secret(),
  BETTER_AUTH_SECRET: secret(),
  S3_ENDPOINT: "https://storage.test",
  S3_REGION: "garage",
  S3_BUCKET: "gemukore-production-test",
  S3_ACCESS_KEY_ID: "PROVISION_WITH_GARAGE",
  S3_SECRET_ACCESS_KEY: "PROVISION_WITH_GARAGE",
  S3_FORCE_PATH_STYLE: "true",
  GARAGE_RPC_SECRET: secret(),
  GARAGE_ADMIN_TOKEN: secret(),
  GARAGE_NODE_CAPACITY: "1073741824",
  PRODUCTION_VOLUME_PREFIX: project,
  GEMUKORE_IMAGE: "gemukore:production-test",
  GEMUKORE_OPERATIONS_IMAGE: "gemukore-operations:production-test",
  GOOGLE_CLIENT_ID: "production-docker-test",
  GOOGLE_CLIENT_SECRET: "production-docker-test",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  IGDB_CLIENT_ID: "",
  IGDB_CLIENT_SECRET: "",
  ACCESSORY_METADATA_PROVIDER: "none",
  WIKIDATA_USER_AGENT: "",
};
const environment = { ...process.env, ...values };
const baseArgs = [
  "compose",
  "--project-name",
  project,
  "--env-file",
  envFile,
  "-f",
  "docker-compose.production.yml",
];
const args = [...baseArgs, "-f", override];
const volumes = [];
function diagnostic(value) {
  let output = String(value ?? "");
  for (const [key, secret] of Object.entries(values))
    if (/PASSWORD|SECRET|TOKEN|ACCESS_KEY_ID/.test(key) && secret)
      output = output.replaceAll(secret, "[redacted]");
  output = output.replace(
    /("secretAccessKey"\s*:\s*")[^"]+("?)/g,
    "$1[redacted]$2",
  );
  return output.slice(-12000);
}
async function docker(parameters, timeout = 180000) {
  return exec("docker", parameters, {
    env: environment,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}
async function compose(parameters, timeout) {
  return docker([...args, ...parameters], timeout);
}
async function probe(command) {
  const result = await compose([
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "node",
    "operations",
    "--conditions=react-server",
    "--import",
    "tsx",
    "tests/helpers/production-probe.ts",
    command,
  ]);
  return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
}
try {
  await writeFile(
    envFile,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    { mode: 0o600 },
  );
  // A one-day, test-only certificate; application-to-S3 TLS verification stays enabled.
  await exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=GemuKore production test",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:storage.test",
    "-keyout",
    join(directory, "key.pem"),
    "-out",
    join(directory, "certificate.pem"),
  ]);
  await chmod(join(directory, "certificate.pem"), 0o644);
  const proxyGlobals = (await readFile("docker/proxy/Caddyfile", "utf8")).split(
    "\nimport /etc/caddy/routes.caddy",
  )[0];
  if (!proxyGlobals.trim().endsWith("}"))
    throw new Error("Production proxy globals were not found");
  await writeFile(
    join(directory, "Caddyfile"),
    `${proxyGlobals.replace(
      "{",
      `{
  auto_https disable_redirects
  default_sni storage.test`,
    )}
import /etc/caddy/routes.caddy
https://127.0.0.1 {
  tls /test/certificate.pem /test/key.pem
  # A test-only broken upstream exercises the production error-log filter.
  handle /__test_proxy_failure {
    reverse_proxy 127.0.0.1:1
  }
  handle {
    import app_routes
  }
}
https://storage.test {
  tls /test/certificate.pem /test/key.pem
  import storage_routes
}
http://:8080 {
  respond /healthz 204
}
`,
  );
  const ca = `${directory}/certificate.pem:/test/certificate.pem:ro`;
  const services = {};
  for (const name of [
    "app",
    "migrate",
    "operations",
    "storage-init",
    "proxy",
    "postgres",
    "garage1",
    "garage2",
    "garage3",
  ])
    services[name] = { labels: { "gemukore.test": "true" } };
  services.proxy.volumes = [
    `${directory}/Caddyfile:/etc/caddy/Caddyfile:ro`,
    ca,
    `${directory}/key.pem:/test/key.pem:ro`,
  ];
  for (const name of ["app", "migrate", "operations"]) {
    services[name].environment = {
      BETTER_AUTH_URL: "https://127.0.0.1:3111",
      NODE_EXTRA_CA_CERTS: "/test/certificate.pem",
    };
    services[name].volumes = [ca];
  }
  services.operations.environment.TEST_APP_PASSWORD =
    values.POSTGRES_APP_PASSWORD;
  services.operations.volumes.push(`${resolve("tests")}:/app/tests:ro`);
  await writeFile(override, JSON.stringify({ services }));
  await docker([...baseArgs, "config", "--quiet"]);
  const { stdout } = await compose(["config", "--format", "json"]);
  const config = JSON.parse(stdout);
  for (const volume of Object.values(config.volumes)) {
    if (!volume.external || !volume.name.startsWith(`${project}-`))
      throw new Error("Unsafe test volume name");
    await docker([
      "volume",
      "create",
      "--label",
      "gemukore.test=true",
      volume.name,
    ]);
    volumes.push(volume.name);
  }
  console.info("Building the isolated production images...");
  // Compose does not print resolved environment values during these builds.
  await compose(["build", "app", "migrate"], 1200000);
  await docker([
    ...baseArgs,
    "run",
    "--rm",
    "--no-deps",
    "proxy",
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
  ]);
  console.info(
    "Starting PostgreSQL, three Garage replicas, the app and HTTPS proxy...",
  );
  const provisionArgs = [
    "scripts/provision-production-storage.mjs",
    envFile,
    "--project-name",
    project,
    "-f",
    override,
  ];
  await exec(process.execPath, provisionArgs, {
    env: environment,
    timeout: 240000,
  });
  const provisionedSource = await readFile(envFile, "utf8");
  const generated = parseEnv(provisionedSource);
  values.S3_ACCESS_KEY_ID = generated.S3_ACCESS_KEY_ID;
  values.S3_SECRET_ACCESS_KEY = generated.S3_SECRET_ACCESS_KEY;
  Object.assign(environment, {
    S3_ACCESS_KEY_ID: values.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: values.S3_SECRET_ACCESS_KEY,
  });
  if (((await stat(envFile)).mode & 0o777) !== 0o600)
    throw new Error("Credentials file permissions changed");
  await exec(process.execPath, provisionArgs, {
    env: environment,
    timeout: 240000,
  });
  if ((await readFile(envFile, "utf8")) !== provisionedSource)
    throw new Error("Existing storage credentials were changed");
  await compose(
    ["up", "--detach", "--wait", "--wait-timeout", "180", "--no-build"],
    240000,
  );
  const { stdout: appId } = await compose(["ps", "--quiet", "app"]);
  const { stdout: inspection } = await docker(["inspect", appId.trim()]);
  const app = JSON.parse(inspection)[0];
  if (
    app.Config.User !== "node" ||
    !app.HostConfig.ReadonlyRootfs ||
    !app.HostConfig.CapDrop.includes("ALL")
  )
    throw new Error("Runtime isolation check failed");
  for (const name of ["app", "postgres", "garage1", "garage2", "garage3"]) {
    const { stdout: id } = await compose(["ps", "--quiet", name]);
    const { stdout: info } = await docker(["inspect", id.trim()]);
    const ports = JSON.parse(info)[0].HostConfig.PortBindings;
    if (ports && Object.keys(ports).length)
      throw new Error("An internal service published a port");
  }
  await compose([
    "exec",
    "-T",
    "app",
    "node",
    "-e",
    "const f=require('node:fs'); for(const p of ['.env.production','tests','scripts/access-admin.ts','node_modules/prisma','/usr/local/lib/node_modules/npm','/usr/local/bin/npm','/usr/local/bin/npx']) if(f.existsSync(p)) process.exit(1); if(process.getuid()!==1000 || process.version!=='v24.22.1')process.exit(1)",
  ]);
  await probe("privileges");
  await probe("seed");
  console.info(
    "Checking authenticated uploads, 3D delivery and public media over HTTPS...",
  );
  await exec(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.production.config.ts",
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...environment,
        PRODUCTION_TEST_PROJECT: project,
        PRODUCTION_TEST_ENV: envFile,
        PRODUCTION_TEST_OVERRIDE: override,
        BETTER_AUTH_URL: "https://127.0.0.1:3111",
      },
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024,
    },
  ).then(({ stdout }) => console.info(stdout));
  const proxyErrors = (await compose(["logs", "--no-color", "proxy"])).stdout;
  if (
    !proxyErrors.includes('"status":502') ||
    [
      "security-review-code",
      "security-review-state",
      "security-review-header",
    ].some((value) => proxyErrors.includes(value))
  )
    throw new Error("Proxy error-log privacy check failed");
  await probe("seed");
  console.info(
    "Recreating containers with retained volumes and rerunning setup...",
  );
  await compose(["down"], 90000);
  await compose(
    ["up", "--detach", "--wait", "--wait-timeout", "180", "--no-build"],
    240000,
  );
  await probe("check");
  await probe("privileges");
  console.info(
    "Production Docker checks passed, including retained database and object bytes.",
  );
  console.info(
    "Testing encrypted backup and restore into entirely new volumes...",
  );
  const baseline = await probe("capture-backup");
  const backupRoot = join(directory, "encrypted-backups");
  const keyFile = join(directory, "backup.key");
  await writeFile(keyFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  const backupArgs = ["scripts/backup/production.mjs"];
  const backup = JSON.parse(
    (
      await exec(
        process.execPath,
        [
          ...backupArgs,
          "create",
          "--env-file",
          envFile,
          "--directory",
          backupRoot,
          "--key-file",
          keyFile,
          "--project-name",
          project,
          "--compose-file",
          override,
        ],
        { env: environment, timeout: 300000, maxBuffer: 1024 * 1024 },
      )
    ).stdout.trim(),
  );
  await probe("check"); // Backup's maintenance window resumed the source stack.
  // Prove a damaged encrypted payload is rejected before creating recovery data.
  const damaged = join(backup.directory, "database.dump.enc");
  const original = await readFile(damaged);
  const corrupted = Buffer.from(original);
  corrupted[corrupted.length - 20] ^= 1;
  await writeFile(damaged, corrupted);
  let rejected = false;
  try {
    await exec(
      process.execPath,
      [
        ...backupArgs,
        "verify",
        "--directory",
        backup.directory,
        "--key-file",
        keyFile,
      ],
      { env: environment, timeout: 30000 },
    );
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Damaged backup was accepted");
  await writeFile(damaged, original);
  await compose(["down"], 90000);
  const restoredPrefix = `${project}-restored`;
  const recoveryEnv = join(directory, "recovery.env");
  const restoreArgs = [
    ...backupArgs,
    "restore",
    "--directory",
    backup.directory,
    "--key-file",
    keyFile,
    "--volume-prefix",
    restoredPrefix,
    "--env-output",
    recoveryEnv,
    "--compose-file",
    override,
  ];
  await exec(process.execPath, restoreArgs, {
    env: environment,
    timeout: 300000,
    maxBuffer: 1024 * 1024,
  });
  // Restore must refuse a second attempt on the same target; no existing data is replaced.
  rejected = false;
  try {
    await exec(process.execPath, restoreArgs, {
      env: environment,
      timeout: 30000,
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Restore reused an existing recovery target");
  const recovery = parseEnv(await readFile(recoveryEnv, "utf8"));
  await writeFile(
    recoveryEnv,
    (await readFile(recoveryEnv, "utf8"))
      .replace(/^HTTP_PORT=.*$/m, "HTTP_PORT=3110")
      .replace(/^HTTPS_PORT=.*$/m, "HTTPS_PORT=3111"),
  );
  const recoveryArgs = [
    "compose",
    "--project-name",
    restoredPrefix,
    "--env-file",
    recoveryEnv,
    "-f",
    "docker-compose.production.yml",
    "-f",
    override,
  ];
  const recoveryEnvironment = {
    ...environment,
    ...recovery,
    HTTP_PORT: "3110",
    HTTPS_PORT: "3111",
  };
  try {
    await exec(
      "docker",
      [
        ...recoveryArgs,
        "up",
        "--detach",
        "--wait",
        "--wait-timeout",
        "180",
        "--no-build",
      ],
      { env: recoveryEnvironment, timeout: 240000 },
    );
    const restoredCapture = await exec(
      "docker",
      [
        ...recoveryArgs,
        "run",
        "--rm",
        "--no-deps",
        "--entrypoint",
        "node",
        "operations",
        "--conditions=react-server",
        "--import",
        "tsx",
        "tests/helpers/production-probe.ts",
        "capture-backup",
      ],
      { env: recoveryEnvironment, timeout: 60000 },
    );
    if (
      JSON.stringify(JSON.parse(restoredCapture.stdout).tables) !==
      JSON.stringify(baseline.tables)
    )
      throw new Error("Restored database contents differ");
    await exec(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.production.config.ts",
        "restore.spec.ts",
      ],
      {
        env: {
          ...recoveryEnvironment,
          PRODUCTION_TEST_PROJECT: restoredPrefix,
          PRODUCTION_TEST_ENV: recoveryEnv,
          PRODUCTION_TEST_OVERRIDE: override,
          PRODUCTION_RESTORE_FIXTURE: JSON.stringify(baseline),
          BETTER_AUTH_URL: "https://127.0.0.1:3111",
        },
        timeout: 180000,
      },
    ).then(({ stdout }) => console.info(stdout));
    console.info(
      "Encrypted backup/restore passed: database hashes and all READY asset bytes match, with private media verified in both browsers.",
    );
  } finally {
    await exec("docker", [...recoveryArgs, "down", "--remove-orphans"], {
      env: recoveryEnvironment,
      timeout: 90000,
    }).catch(() => {});
  }
} catch (error) {
  // Avoid dumping child-process objects or resolved configuration containing secrets.
  console.error("Production Docker checks failed.");
  if (error instanceof Error && error.message.startsWith("Runtime"))
    console.error(error.message);
  console.error(diagnostic(error?.stdout));
  console.error(diagnostic(error?.stderr));
  const logs = await compose([
    "logs",
    "--no-color",
    "--tail",
    "30",
    "migrate",
    "storage-init",
    "garage1",
    "app",
    "proxy",
  ]).catch(() => null);
  if (logs) console.error(diagnostic(logs.stdout));
  process.exitCode = 1;
} finally {
  await compose(["down", "--remove-orphans"], 90000).catch(() => {});
  const recoveryFile = join(directory, "recovery.env");
  await docker(
    [
      "compose",
      "--project-name",
      `${project}-restored`,
      "--env-file",
      recoveryFile,
      "-f",
      "docker-compose.production.yml",
      "-f",
      override,
      "down",
      "--remove-orphans",
    ],
    90000,
  ).catch(() => {});
  const restoredNames = (
    await docker(["volume", "ls", "--format", "{{.Name}}"])
  ).stdout
    .trim()
    .split("\n")
    .filter((name) => name.startsWith(`${project}-restored-`));
  for (const name of restoredNames) {
    const marker = (
      await docker([
        "volume",
        "inspect",
        "--format",
        '{{index .Labels "gemukore.restore"}}',
        name,
      ])
    ).stdout.trim();
    if (/^[a-f0-9-]{36}$/.test(marker)) await docker(["volume", "rm", name]);
  }
  for (const name of volumes) {
    const { stdout } = await docker([
      "volume",
      "inspect",
      "--format",
      '{{index .Labels "gemukore.test"}}',
      name,
    ]);
    if (stdout.trim() === "true" && name.startsWith(`${project}-`))
      await docker(["volume", "rm", name]);
  }
  await rm(directory, { recursive: true, force: true });
}
