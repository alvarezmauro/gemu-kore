"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  requirePrivateAccess,
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getAuthEnv } from "@/server/config/env";
import { PublicCollectionError } from "@/server/services/public-collection/common";
import * as publication from "@/server/services/public-collection/publication";
import { settingsReviewInput, settingsMutation } from "./validation";
import type { PublicationResult } from "./admin-contracts";

async function perform<T>(
  operation: (context: PrivateAccessContext) => Promise<T>,
): Promise<PublicationResult<T>> {
  try {
    const requestHeaders = await headers();
    const context = await requirePrivateAccess(requestHeaders);
    const auth = getAuthEnv();
    if (
      !auth ||
      requestHeaders.get("origin") !== auth.baseURL ||
      requestHeaders.get("sec-fetch-site") === "cross-site"
    )
      throw new PermissionError("FORBIDDEN");
    return { status: "success", data: await operation(context) };
  } catch (error) {
    if (error instanceof PublicCollectionError)
      return { status: "error", message: error.message };
    if (error instanceof PrivateAccessError || error instanceof PermissionError)
      return {
        status: "error",
        message:
          "Your access has changed or this request is not permitted. Reload and sign in as an administrator.",
      };
    return {
      status: "error",
      message: "Publication is unavailable right now. Please try again.",
    };
  }
}

// These capabilities must remain off until their contextual delivery and SEO
// implementations exist. Enforce this on the server, not only disabled controls.
function availableSettings<
  T extends {
    settings: {
      showPersonalPhotos: boolean;
      allowSearchEngineIndexing: boolean;
    };
  },
>(data: T) {
  if (
    data.settings.showPersonalPhotos ||
    data.settings.allowSearchEngineIndexing
  )
    throw new PublicCollectionError("INVALID_INPUT");
  return data;
}
export async function reviewPublicationSettings(input: unknown) {
  return perform(async (context) => {
    const parsed = settingsReviewInput.safeParse(input);
    if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
    return publication.reviewPublicSettings(
      context,
      availableSettings(parsed.data),
    );
  });
}
export async function savePublicationSettings(input: unknown) {
  const result = await perform(async (context) => {
    const parsed = settingsMutation.safeParse(input);
    if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
    return publication.updatePublicSettings(
      context,
      availableSettings(parsed.data),
    );
  });
  if (result.status === "success") revalidatePath("/app/settings/public");
  return result;
}
export async function reviewItemPublication(input: unknown) {
  return perform((context) =>
    publication.getItemPublicationReview(context, input),
  );
}
export async function saveItemPublication(input: unknown) {
  const result = await perform((context) =>
    publication.setItemPublication(context, input),
  );
  if (result.status === "success") revalidatePath("/app/settings/public");
  return result;
}
