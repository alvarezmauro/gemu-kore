"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  mutateOwnedGame,
  GameError,
} from "@/server/services/collection/game-management";
import type { Result } from "./creation-contracts";
export async function changeOwnedGame(input: unknown): Promise<Result<null>> {
  try {
    await mutateOwnedGame(await requirePrivateAccess(await headers()), input);
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof GameError
          ? e.message
          : e instanceof PermissionError
            ? "Your account cannot change games right now."
            : e instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this change. Refresh to check the latest copy before trying again.",
    };
  }
  revalidatePath("/app/games/[id]", "page");
  for (const path of [
    "/app/collection",
    "/app/search",
    "/app/media",
    "/app/defects",
    "/app/locations",
  ])
    revalidatePath(path);
  return { status: "success", data: null };
}
