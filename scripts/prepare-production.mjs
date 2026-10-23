import { execFileSync } from "node:child_process";

try {
  const file = process.argv[2] ?? ".env.production";
  const config = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        file,
        "-f",
        "docker-compose.production.yml",
        "config",
        "--format",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  for (const volume of Object.values(config.volumes)) {
    if (!volume.external || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(volume.name))
      throw new Error("Unexpected production volume.");
    execFileSync(
      "docker",
      ["volume", "create", "--label", "gemukore.production=true", volume.name],
      { stdio: "ignore" },
    );
  }
  console.info("Retained production volumes are ready.");
} catch {
  console.error(
    "Production preparation failed. Check the environment file and Docker configuration.",
  );
  process.exitCode = 1;
}
