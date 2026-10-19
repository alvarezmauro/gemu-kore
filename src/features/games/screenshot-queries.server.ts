import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getScreenshotGallery,
  ScreenshotError,
} from "@/server/services/catalog/screenshots";
export async function getScreenshotsPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getScreenshotGallery(
        await requirePrivateAccess(await headers()),
        input,
        true,
      )),
    };
  } catch (e) {
    return {
      status:
        e instanceof PrivateAccessError
          ? e.code
          : e instanceof PermissionError
            ? ("FORBIDDEN" as const)
            : e instanceof ScreenshotError && e.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
