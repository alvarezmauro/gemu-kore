import "server-only";
import { requirePermission, PermissionError } from "@/server/auth/permissions";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { withTransaction } from "@/server/db/transaction";
import {
  readPolicy,
  siteIdentity,
} from "@/server/repositories/public-collection/policy";
import * as repository from "@/server/repositories/public-collection/publication";
import { findReviewDetail } from "@/server/repositories/public-collection/detail";
import {
  itemReviewInput,
  itemPublicationMutation,
  settingsReviewInput,
  settingsMutation,
} from "@/features/public-collection/validation";
import { PublicCollectionError, count } from "./common";
import { detailProjection } from "./presentation";
function failure(error: unknown): never {
  if (
    error instanceof PublicCollectionError ||
    error instanceof PrivateAccessError ||
    error instanceof PermissionError
  )
    throw error;
  throw new PublicCollectionError("UNAVAILABLE");
}
export async function getPublicationSettings(context: PrivateAccessContext) {
  try {
    return await withTransaction(async (tx) => {
      await requirePermission(context, "settings.manage", tx);
      const policy = await readPolicy(tx);
      if (!policy) throw new PublicCollectionError("UNAVAILABLE");
      return policy;
    });
  } catch (error) {
    failure(error);
  }
}
export async function reviewPublicSettings(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "settings.manage", tx);
        const parsed = settingsReviewInput.safeParse(input);
        if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
        const policy = await readPolicy(tx);
        if (!policy || policy.revision !== parsed.data.expectedRevision)
          throw new PublicCollectionError("STALE");
        const affectedCopies = count(
          await repository.impactCount(policy, parsed.data.settings, tx),
        );
        return {
          affectedCopies,
          site: await siteIdentity(tx),
          reviewToken: await repository.reviewToken(parsed.data.settings, tx),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    failure(error);
  }
}
export async function updatePublicSettings(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        const actor = await requirePermission(context, "settings.manage", tx);
        const parsed = settingsMutation.safeParse(input);
        if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
        const d = parsed.data,
          before = await readPolicy(tx);
        if (
          !before ||
          before.revision !== d.expectedRevision ||
          (await repository.reviewToken(d.settings, tx)) !== d.reviewToken
        )
          throw new PublicCollectionError("STALE");
        if (
          Object.entries(d.settings).every(
            ([key, value]) => Reflect.get(before, key) === value,
          )
        )
          return { revision: before.revision, unpublished: 0 };
        const unpublished = await repository.invalidateExpandedCopies(
          before,
          d.settings,
          actor.userId,
          tx,
        );
        const result = await repository.saveSettings(d.settings, tx);
        return { revision: result.revision, unpublished };
      },
      { isolationLevel: "ReadCommitted", publicationPolicy: "exclusive" },
    );
  } catch (error) {
    failure(error);
  }
}
export async function getItemPublicationReview(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "publication.manage", tx);
        const parsed = itemReviewInput.safeParse(input);
        if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
        const policy = await readPolicy(tx);
        if (!policy) throw new PublicCollectionError("UNAVAILABLE");
        const state = await repository.itemState(parsed.data.id, tx);
        const row = await findReviewDetail(parsed.data.id, policy, tx);
        if (!state || !row) throw new PublicCollectionError("NOT_FOUND");
        return {
          preview: "public-projection" as const,
          item: await detailProjection(row, policy, tx),
          revision: state.revision,
          settingsRevision: policy.revision,
          published: state.publicationStatus === "PUBLISHED",
          reviewToken: await repository.reviewToken(parsed.data, tx),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    failure(error);
  }
}
export async function setItemPublication(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "publication.manage", tx);
        const parsed = itemPublicationMutation.safeParse(input);
        if (!parsed.success) throw new PublicCollectionError("INVALID_INPUT");
        const d = parsed.data;
        await repository.lockItem(d.id, tx);
        const actor = await requirePermission(
          context,
          "publication.manage",
          tx,
        );
        const policy = await readPolicy(tx),
          state = await repository.itemState(d.id, tx);
        if (!state) throw new PublicCollectionError("NOT_FOUND");
        if (
          !policy ||
          policy.revision !== d.expectedSettingsRevision ||
          state.revision !== d.expectedRevision ||
          (await repository.reviewToken(
            { id: d.id, published: d.published },
            tx,
          )) !== d.reviewToken
        )
          throw new PublicCollectionError("STALE");
        if ((state.publicationStatus === "PUBLISHED") === d.published)
          return { revision: state.revision };
        return repository.saveItem(d.id, d.published, actor.userId, tx);
      },
      { isolationLevel: "ReadCommitted", publicationPolicy: "exclusive" },
    );
  } catch (error) {
    failure(error);
  }
}
