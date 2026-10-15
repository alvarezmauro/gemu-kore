import "server-only";
import {
  optionsQuery,
  type OptionRow,
  type ControlParameters,
} from "./controls-query";
import {
  privateCatalogSearchQuery,
  type CatalogSearchRow,
} from "./catalog-query";
import type { TransactionClient } from "../../db/transaction";
import {
  privateSearchQuery,
  filteredPrivateSearchQuery,
  type ParsedTerm,
  type SearchParameters,
  type SearchRow,
} from "./query";
export async function configureSearch(tx: TransactionClient) {
  await tx.$queryRaw`SELECT set_config('statement_timeout','2000',true),set_config('pg_trgm.word_similarity_threshold','0.6',true)`;
}
export function parseSearchTerms(q: string, tx: TransactionClient) {
  return tx.$queryRaw<
    ParsedTerm[]
  >`WITH folded AS (SELECT DISTINCT lower(normalize(term,NFC)) term FROM unnest(string_to_array(${q},' ')) term), parsed AS (SELECT term,to_tsvector('pg_catalog.simple',term) v FROM folded)
  SELECT row_number() OVER(ORDER BY term)::int ordinal,term,plainto_tsquery('pg_catalog.simple',term)::text exact,
  (SELECT string_agg(array_to_tsvector(ARRAY[lexeme])::text || CASE WHEN length(lexeme)>=2 THEN ':*' ELSE '' END,' & ' ORDER BY lexeme)::tsquery::text FROM unnest(tsvector_to_array(v)) lexeme) prefix,
  cardinality(tsvector_to_array(v))::int lexemes,(length(term)>=4 AND term ~ '^[[:alpha:]]+$') fuzzy FROM parsed ORDER BY term`;
}
export function searchPrivateRows(
  input: SearchParameters,
  terms: ParsedTerm[],
  tx: TransactionClient,
) {
  return tx.$queryRaw<SearchRow[]>(privateSearchQuery(input, terms));
}

export async function searchCatalogRows(
  q: string,
  terms: ParsedTerm[],
  tx: TransactionClient,
) {
  return tx.$queryRaw<CatalogSearchRow[]>(privateCatalogSearchQuery(q, terms));
}

export type FilteredSearchRow = SearchRow & {
  details: {
    releaseYear: number | null;
    location: string | null;
    platform: string | null;
    publisher: string | null;
  };
};
export function searchFilteredRows(
  input: SearchParameters,
  terms: ParsedTerm[],
  controls: ControlParameters,
  tx: TransactionClient,
) {
  return tx.$queryRaw<FilteredSearchRow[]>(
    filteredPrivateSearchQuery(input, terms, controls),
  );
}
export function listFilterOptions(tx: TransactionClient) {
  return tx.$queryRaw<OptionRow[]>(optionsQuery());
}
