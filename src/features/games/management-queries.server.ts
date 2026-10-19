import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getOwnedGame,
  GameError,
} from "@/server/services/collection/game-management";
export async function getOwnedGamePageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getOwnedGame(
        await requirePrivateAccess(await headers()),
        input,
      )),
    };
  } catch (e) {
    return {
      status:
        e instanceof PrivateAccessError
          ? e.code
          : e instanceof PermissionError
            ? ("FORBIDDEN" as const)
            : e instanceof GameError && e.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
