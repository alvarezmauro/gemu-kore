import { loadEnvConfig } from "@next/env";
import { userInfo } from "node:os";
import { parseArgs } from "node:util";
import { disconnectDatabase } from "../src/server/db/client";
import {
  bootstrapAdministrator,
  GrantSetupError,
  recoverAdministrator,
} from "../src/server/services/access";

async function main() {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command !== "bootstrap" && command !== "recover")
      throw new GrantSetupError("INVALID_INPUT");
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        email: { type: "string" },
        operator: { type: "string" },
        ...(command === "recover"
          ? {
              "previous-email": { type: "string" as const },
              "rebind-user": { type: "string" as const },
              reason: { type: "string" as const },
            }
          : {}),
        help: { type: "boolean" },
      },
    });
    if (values.help) {
      console.info(
        command === "bootstrap"
          ? "pnpm access:bootstrap --email <verified-email> [--operator <name>]"
          : "pnpm access:recover --email <verified-email> --operator <name> --reason <reason> [--previous-email <old-email>] [--rebind-user <existing-user-uuid>]",
      );
      return;
    }
    loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
    const input = {
      email: values.email,
      operator:
        values.operator ??
        (command === "bootstrap" ? userInfo().username : undefined),
    };
    const receipt =
      command === "bootstrap"
        ? await bootstrapAdministrator(input)
        : await recoverAdministrator({
            ...input,
            previousEmail: values["previous-email"],
            rebindUserId: values["rebind-user"],
            reason: values.reason,
          });
    // Explicit operator receipt only: never include credentials or sessions.
    console.info(JSON.stringify(receipt));
  } catch (error) {
    console.error(
      error instanceof GrantSetupError
        ? error.message
        : "Access setup failed. Check command arguments, configuration and database connectivity.",
    );
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch {
      console.error("Database connection cleanup failed.");
      process.exitCode = 1;
    }
  }
}

void main();
