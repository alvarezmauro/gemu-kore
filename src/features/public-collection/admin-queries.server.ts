import "server-only";
import { z } from "zod";
import { headers } from "next/headers";
import { PrivateAccessError, requirePrivateAccess } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { searchFilteredCollection } from "@/server/services/search/filtered";
import { searchInput } from "@/features/search/validation";
import {
  getPublicationSettings,
  getItemPublicationReview,
} from "@/server/services/public-collection/publication";

const selection = z.strictObject({
  q: searchInput.shape.q.optional().default(""),
  offset: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().max(5000))
    .optional()
    .default(0),
  item: z.uuid().optional(),
});
export async function getPublicationPageData(input: unknown) {
  try {
    const context = await requirePrivateAccess(await headers());
    await requirePermission(context, "publication.manage");
    const parsed = selection.safeParse(input);
    if (!parsed.success) return { status: "INVALID_INPUT" as const };
    const { q, offset, item } = parsed.data;
    const [settings, copies, selected] = await Promise.all([
      getPublicationSettings(context),
      searchFilteredCollection(context, {
        q,
        offset,
        limit: 20,
        controls: { sort: "newest" },
      }),
      item ? getItemPublicationReview(context, { id: item }) : null,
    ]);
    const media = item
      ? await (
          await import("@/server/services/public-collection/media-reviews")
        ).mediaReviewChoices(context, item)
      : null;
    return {
      status: "authorized" as const,
      settings,
      copies,
      selected,
      q,
      media,
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof PermissionError) return { status: "DENIED" as const };
    return { status: "UNAVAILABLE" as const };
  }
}
