import { randomUUID } from "node:crypto";
import { disconnectDatabase, getDatabase } from "../../src/server/db/client";

async function main() {
  if (
    !process.env.DATABASE_URL?.includes("/gemukore_test?schema=public") ||
    process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3111"
  ) {
    throw new Error(
      "Access browser fixtures require the isolated test runner.",
    );
  }
  const [command, argument] = process.argv.slice(2);
  const database = getDatabase();
  try {
    let result: unknown = null;
    if (command === "reset") {
      await database.accessGrant.deleteMany();
      await database.user.deleteMany();
    } else if (command === "sign-in") {
      const options = JSON.parse(argument ?? "{}") as {
        email?: string;
        role?: "ADMIN" | "EDITOR" | "VIEWER";
        enabled?: boolean;
        verified?: boolean;
      };
      const email = options.email ?? "browser-identity@example.com";
      const user = await database.user.create({
        data: {
          name: "Browser fixture",
          email,
          emailVerified: options.verified ?? true,
        },
      });
      const token = randomUUID();
      await database.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      if (options.role)
        await database.accessGrant.create({
          data: {
            email,
            role: options.role,
            enabled: options.enabled ?? true,
          },
        });
      result = { email, token };
    } else if (command === "update") {
      await database.accessGrant.update({
        where: { email: "browser-identity@example.com" },
        data: JSON.parse(argument),
      });
    } else if (command === "delete") {
      await database.accessGrant.delete({
        where: { email: "browser-identity@example.com" },
      });
    } else if (command === "sessions") {
      result = await database.session.count();
    } else if (command === "expire") {
      await database.session.updateMany({
        where: { user: { email: argument } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    } else if (command === "revoke") {
      await database.session.deleteMany({
        where: { user: { email: argument } },
      });
    } else throw new Error("Unknown access browser fixture command.");
    console.info(JSON.stringify(result));
  } finally {
    await disconnectDatabase();
  }
}

void main().catch(() => {
  console.error("Access browser fixture failed.");
  process.exitCode = 1;
});
