import "server-only";
import { searchInput } from "@/features/search/validation";
import type { SearchResult } from "@/features/search/contracts";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "../../auth/access";
import { requirePermission, PermissionError } from "../../auth/permissions";
import { withTransaction } from "../../db/transaction";
import {
  configureSearch,
  parseSearchTerms,
  searchPrivateRows,
} from "../../repositories/search";
export class SearchError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "UNAVAILABLE") {
    super(
      code === "INVALID_INPUT"
        ? "Use up to 160 characters, eight words and sixteen searchable terms."
        : "Search is unavailable right now. Please try again.",
    );
    this.name = "SearchError";
  }
}
export async function searchPrivateCollection(
  context: PrivateAccessContext,
  input: unknown,
): Promise<SearchResult> {
  await requirePermission(context, "private.read");
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) throw new SearchError("INVALID_INPUT");
  const data = parsed.data;
  const empty: SearchResult = {
    state: [...data.q].length < 2 ? "idle" : "ready",
    items: [],
    hasMore: false,
    offset: data.offset,
    limit: data.limit,
  };
  if ([...data.q].length < 2 || !/[\p{L}\p{N}]/u.test(data.q)) return empty;
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        await configureSearch(tx);
        const terms = await parseSearchTerms(data.q, tx);
        if (terms.reduce((count, term) => count + term.lexemes, 0) > 16)
          throw new SearchError("INVALID_INPUT");
        const rows = await searchPrivateRows(data, terms, tx);
        return {
          ...empty,
          items: rows.slice(0, data.limit),
          hasMore: rows.length > data.limit,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    if (
      error instanceof SearchError ||
      error instanceof PrivateAccessError ||
      error instanceof PermissionError
    )
      throw error;
    throw new SearchError("UNAVAILABLE");
  }
}
