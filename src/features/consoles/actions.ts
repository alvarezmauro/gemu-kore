"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { PrivateAccessError, requirePrivateAccess } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  ConsoleError,
  createConsole,
  findConsolePlatforms,
  findConsoleModels,
  activateNewConsoleOverride,
} from "@/server/services/collection/consoles";
import { getConsoleModelPresentation } from "@/server/services/collection/console-presentation";
import type { ModelPresentationResult } from "@/lib/three/contracts";
import { mutateOwnedConsole } from "@/server/services/collection/console-management";
import type {
  ConsoleResult,
  ConsoleChoices,
  ConsolePlatformOption,
  ConsoleModelOption,
} from "./contracts";
function failure(error: unknown): { status: "error"; message: string } {
  return {
    status: "error",
    message:
      error instanceof ConsoleError
        ? error.message
        : error instanceof PermissionError
          ? "Your account cannot change consoles right now."
          : error instanceof PrivateAccessError && error.code !== "UNAVAILABLE"
            ? "Your access changed. Sign in again before continuing."
            : "We couldn't confirm the result. Keep this page open and try again.",
  };
}
export async function changeOwnedConsole(
  input: unknown,
): Promise<ConsoleResult<null>> {
  try {
    await mutateOwnedConsole(
      await requirePrivateAccess(await headers()),
      input,
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/consoles/[id]", "page");
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
export async function selectConsoleOverride(
  input: unknown,
): Promise<ConsoleResult<null>> {
  try {
    await activateNewConsoleOverride(
      await requirePrivateAccess(await headers()),
      input,
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/collection");
  return { status: "success", data: null };
}
export async function lookupConsolePlatforms(
  input: unknown,
): Promise<ConsoleResult<ConsoleChoices<ConsolePlatformOption>>> {
  try {
    return {
      status: "success",
      data: await findConsolePlatforms(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function lookupConsoleModels(
  input: unknown,
): Promise<ConsoleResult<ConsoleChoices<ConsoleModelOption>>> {
  try {
    return {
      status: "success",
      data: await findConsoleModels(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function saveConsole(
  input: unknown,
): Promise<ConsoleResult<{ id: string }>> {
  let id: string;
  try {
    id = await createConsole(
      await requirePrivateAccess(await headers()),
      input,
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/app/collection");
  revalidatePath("/app/search");
  revalidatePath("/app/media");
  revalidatePath("/app/defects");
  revalidatePath("/app/locations");
  return { status: "success", data: { id } };
}

export async function loadConsoleModelView(
  input: unknown,
): Promise<ModelPresentationResult> {
  try {
    return {
      status: "success",
      data: await getConsoleModelPresentation(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return error instanceof ConsoleError ||
      error instanceof PermissionError ||
      error instanceof PrivateAccessError
      ? failure(error)
      : {
          status: "error",
          message:
            "We couldn't load this console preview. Refresh before trying again.",
        };
  }
}
