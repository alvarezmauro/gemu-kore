import "server-only";
import {
  collectionControls,
  controlsActive,
  type FilterOptions,
} from "@/features/search/controls";
import { searchInput } from "@/features/search/validation";
import type { SearchResult } from "@/features/search/contracts";
import { requirePermission, PermissionError } from "../../auth/permissions";
import {
  PrivateAccessError,
  type PrivateAccessContext,
} from "../../auth/access";
import { withTransaction } from "../../db/transaction";
import {
  configureSearch,
  parseSearchTerms,
  searchFilteredRows,
  listFilterOptions,
} from "../../repositories/search";
import { SearchError } from "./index";
const inputSchema = searchInput
  .extend({ controls: collectionControls })
  .strict();
export async function searchFilteredCollection(
  context: PrivateAccessContext,
  input: unknown,
): Promise<SearchResult> {
  await requirePermission(context, "private.read");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new SearchError("INVALID_INPUT");
  const data = parsed.data;
  const browse = data.q === "" && controlsActive(data.controls);
  const empty: SearchResult = {
    state: [...data.q].length < 2 && !browse ? "idle" : "ready",
    items: [],
    hasMore: false,
    offset: data.offset,
    limit: data.limit,
  };
  if (!browse && ([...data.q].length < 2 || !/[\p{L}\p{N}]/u.test(data.q)))
    return empty;
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        await configureSearch(tx);
        const terms = browse ? [] : await parseSearchTerms(data.q, tx);
        if (terms.reduce((n, t) => n + t.lexemes, 0) > 16)
          throw new SearchError("INVALID_INPUT");
        const rows = await searchFilteredRows(data, terms, data.controls, tx);
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
      error instanceof PermissionError ||
      error instanceof PrivateAccessError
    )
      throw error;
    throw new SearchError("UNAVAILABLE");
  }
}
export async function getCollectionFilterOptions(
  context: PrivateAccessContext,
): Promise<FilterOptions> {
  await requirePermission(context, "private.read");
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        await configureSearch(tx);
        const rows = await listFilterOptions(tx);
        const result: FilterOptions = {
          platform: [],
          manufacturer: [],
          publisher: [],
          producer: [],
          model: [],
          region: [],
          year: [],
          location: [],
        };
        for (const row of rows)
          result[row.field].push({ value: row.value, label: row.label });
        return result;
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    if (error instanceof PermissionError || error instanceof PrivateAccessError)
      throw error;
    throw new SearchError("UNAVAILABLE");
  }
}
