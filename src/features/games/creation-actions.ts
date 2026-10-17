"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  GameCreationError,
  findGames,
  findGameReleases,
  selectGameRelease,
  createGameCopy,
} from "@/server/services/collection/games";
import type {
  Result,
  Choices,
  GameChoice,
  ReleaseChoice,
} from "./creation-contracts";
function failure(e: unknown): { status: "error"; message: string } {
  return {
    status: "error",
    message:
      e instanceof GameCreationError
        ? e.message
        : e instanceof PermissionError
          ? "Your account cannot add games right now."
          : e instanceof PrivateAccessError
            ? "Your access changed. Sign in again."
            : "We couldn't confirm the result. Keep this page open and try again.",
  };
}
export async function lookupGames(
  input: unknown,
): Promise<Result<Choices<GameChoice>>> {
  try {
    return {
      status: "success",
      data: await findGames(await requirePrivateAccess(await headers()), input),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function lookupGameReleases(
  input: unknown,
): Promise<
  Result<Choices<ReleaseChoice> & { markets: { id: string; name: string }[] }>
> {
  try {
    return {
      status: "success",
      data: await findGameReleases(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function loadGameRelease(
  input: unknown,
): Promise<Result<ReleaseChoice>> {
  try {
    return {
      status: "success",
      data: await selectGameRelease(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function saveGameCopy(
  input: unknown,
): Promise<Result<{ id: string }>> {
  let id: string;
  try {
    id = await createGameCopy(
      await requirePrivateAccess(await headers()),
      input,
    );
  } catch (e) {
    return failure(e);
  }
  for (const path of [
    "/app/collection",
    "/app/search",
    "/app/media",
    "/app/defects",
    "/app/locations",
  ])
    revalidatePath(path);
  return { status: "success", data: { id } };
}
