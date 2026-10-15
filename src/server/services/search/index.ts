import "server-only";
import { searchInput } from "@/features/search/validation";
import { paletteInput } from "@/features/search/palette-validation";
import type { PaletteResult } from "@/features/search/palette-contracts";
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
  searchCatalogRows,
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
  return (await performPrivateSearch(context, input, false)).collection;
}
export async function searchPrivatePalette(
  context: PrivateAccessContext,
  input: unknown,
): Promise<PaletteResult> {
  return performPrivateSearch(context, input, true);
}
async function performPrivateSearch(
  context: PrivateAccessContext,
  input: unknown,
  catalog: boolean,
): Promise<PaletteResult> {
  await requirePermission(context, "private.read");
  const parsed = (catalog ? paletteInput : searchInput).safeParse(input);
  if (!parsed.success) throw new SearchError("INVALID_INPUT");
  const data = { limit: 20, offset: 0, ...parsed.data };
  const empty: SearchResult = {
    state: [...data.q].length < 2 ? "idle" : "ready",
    items: [],
    hasMore: false,
    offset: data.offset,
    limit: data.limit,
  };
  if ([...data.q].length < 2 || !/[\p{L}\p{N}]/u.test(data.q))
    return { collection: empty, catalog: [], catalogHasMore: false };
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        await configureSearch(tx);
        const terms = await parseSearchTerms(data.q, tx);
        if (terms.reduce((count, term) => count + term.lexemes, 0) > 16)
          throw new SearchError("INVALID_INPUT");
        const rows = await searchPrivateRows(data, terms, tx);
        // Keep both scopes in one authorized snapshot; do not dispatch parallel
        // statements on the transaction's single PostgreSQL connection.
        const catalogRows = catalog
          ? await searchCatalogRows(data.q, terms, tx)
          : [];
        return {
          collection: {
            ...empty,
            items: rows.slice(0, data.limit),
            hasMore: rows.length > data.limit,
          },
          catalog: catalogRows.slice(0, 10),
          catalogHasMore: catalogRows.length > 10,
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
