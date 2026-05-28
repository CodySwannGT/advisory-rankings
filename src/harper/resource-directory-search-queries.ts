/**
 * Index-backed read helpers for `/PublicAdvisors`, `/Search`, and `/Feed`.
 *
 * Every public read path that used to call `allRows()` against a large
 * Harper table funnels through this module instead. We rely exclusively
 * on:
 *
 *   - `tables.X.search({ conditions, sort, limit, offset })` — the
 *     Harper-native paginated search (spike §0.1 Q1/Q2/Q5/Q7).
 *   - `rowsByAttribute(tables.X, attr, value)` — the existing indexed
 *     per-id hydration helper.
 *
 * No dynamic `tables[name]` access, no `Reflect.get`. Every table is
 * referenced statically from the ambient `tables` global; the
 * `SearchableTable` cast pattern mirrors `resource-directory-tables.ts`,
 * which is the project's established way to bridge the wider
 * `harperdb.Table` typing to the narrow `search()`-only surface this
 * module needs.
 */

import type {
  AdvisorRow,
  ArticleRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import { rowsByAttribute } from "./resource-directory-tables.js";

/** Per-batch concurrency cap for indexed primary-key hydration. */
const HYDRATE_BATCH = 25;

/** Harper-typed condition shape used throughout this module. */
export interface HarperCondition {
  readonly attribute: string;
  readonly comparator?: string;
  readonly value: unknown;
}

/** Harper-typed sort shape used throughout this module. */
export interface HarperSort {
  readonly attribute: string;
  readonly descending?: boolean;
}

/** Subset of the Harper table shape this module uses. */
interface SearchableTable<T> {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<T>;
}

/** Options for {@link searchPageAndCount}. */
export interface PageAndCountOptions {
  readonly conditions: readonly HarperCondition[];
  readonly sort?: HarperSort;
  readonly limit: number;
  readonly offset: number;
}

/** Output shape from page+count helpers in this module. */
export interface PageAndCount<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Runs a paginated Harper search and returns a fully-materialized page
 * plus a separate count of matching rows. The count is computed by a
 * second `search({ conditions })` pass; Harper's `count` operations API
 * (spike §0.1 Q4) is more efficient but exposed only outside the
 * `tables.X.search()` surface, so this module favours the readable
 * single-API path and accepts the cost. The two queries run in
 * parallel.
 * @param table - Harper table handle (statically resolved).
 * @param options - Conditions, sort, page bounds.
 * @returns Page rows plus matching-row count.
 */
export async function searchPageAndCount<T>(
  table: unknown,
  options: PageAndCountOptions
): Promise<PageAndCount<T>> {
  const searchable = table as SearchableTable<T>;
  const { conditions, sort, limit, offset } = options;
  const pageQuery: Readonly<Record<string, unknown>> = sort
    ? { conditions, sort, limit, offset }
    : { conditions, limit, offset };
  const [items, total] = await Promise.all([
    Array.fromAsync(searchable.search(pageQuery)),
    // Streaming count: the iterator is consumed without materializing
    // every row into an array, so a wide filter (e.g. an unfiltered
    // `/Feed` page) does not reintroduce the unbounded-memory
    // full-table read this issue is meant to remove. Harper's btree
    // path still drives the scan; only the row payloads are
    // discarded.
    streamCount(searchable, conditions),
  ]);
  return { items, total };
}

const streamCount = async <T>(
  searchable: SearchableTable<T>,
  conditions: readonly HarperCondition[]
): Promise<number> => {
  const counter = { count: 0 };
  for await (const _unused of searchable.search({ conditions })) {
    Object.assign(counter, { count: counter.count + 1 });
  }
  return counter.count;
};

/**
 * Hydrates entity rows for a bounded id list via the indexed primary
 * key, batching the per-id lookups so a wide search cannot fan out into
 * an unbounded concurrent burst. Mirrors the pattern already used by
 * `advisorsByIds` in `resource-directory-advisor-firm.ts`.
 * @param table - Harper table handle (statically resolved).
 * @param ids - Distinct entity ids to load.
 * @returns Matching rows in arbitrary order.
 */
export async function rowsByIds<T>(
  table: unknown,
  ids: readonly string[]
): Promise<readonly T[]> {
  if (ids.length === 0) return [];
  const batches = chunkIds(ids);
  return batches.reduce<Promise<readonly T[]>>(async (accumulated, batch) => {
    const rows = await accumulated;
    const fetched = await Promise.all(
      batch.map(id => rowsByAttribute<T>(table, "id", id))
    );
    return [...rows, ...fetched.flat()];
  }, Promise.resolve([]));
}

const chunkIds = (ids: readonly string[]): readonly (readonly string[])[] =>
  Array.from(
    { length: Math.ceil(ids.length / HYDRATE_BATCH) },
    (_unused, batchIndex) =>
      ids.slice(
        batchIndex * HYDRATE_BATCH,
        batchIndex * HYDRATE_BATCH + HYDRATE_BATCH
      )
  );

/**
 * Issues parallel prefix-on-name searches for the global `/Search`
 * resource against the firm side (`name`, `legalName`) and the curated
 * firm-alias side (`normalizedAlias`), then merges by `id`. All three
 * attributes are `@indexed` in `schema.graphql`; per spike §0.1 Q2 a
 * `starts_with` condition on an `@indexed` String is a btree range
 * scan, not a full-table scan.
 * @param query - Normalized lowercased search query (already trimmed).
 * @param cap - Per-query result cap.
 * @returns Distinct firm rows whose name/legalName/alias prefix-matches the query.
 */
export async function firmPrefixSearch(
  query: string,
  cap: number
): Promise<readonly FirmRow[]> {
  if (!query) return [];
  const [byName, byLegalName, aliasRows] = await Promise.all([
    prefixSearch<FirmRow>(tables.Firm, "name", query, cap),
    prefixSearch<FirmRow>(tables.Firm, "legalName", query, cap),
    prefixSearch<FirmAliasRow>(tables.FirmAlias, "normalizedAlias", query, cap),
  ]);
  // Alias rows carry only a foreign-key reference to the firm; hydrate
  // those distinct ids via the indexed primary key. Bounded by the cap
  // so this is at most `cap` indexed point-lookups.
  const aliasFirmIds = [...new Set(aliasRows.map(row => row.firmId))];
  const aliasFirms = await rowsByIds<FirmRow>(tables.Firm, aliasFirmIds);
  return dedupeById<FirmRow>([...byName, ...byLegalName, ...aliasFirms]);
}

/**
 * Issues a single prefix-on-name search for the global `/Search`
 * resource against `tables.Team`. `Team.name` is `@indexed` and the
 * comparator is a btree range scan per spike §0.1 Q2.
 * @param query - Normalized lowercased search query (already trimmed).
 * @param cap - Result cap.
 * @returns Team rows whose name prefix-matches the query.
 */
export async function teamPrefixSearch(
  query: string,
  cap: number
): Promise<readonly TeamRow[]> {
  if (!query) return [];
  return prefixSearch<TeamRow>(tables.Team, "name", query, cap);
}

/**
 * Paginated Article query for `/Feed`. Filters by `category` when the
 * caller asks for anything other than `"all"`, sorts by `publishedDate`
 * descending (the existing in-memory sort the legacy path used), and
 * applies `limit`/`offset` natively.
 *
 * NOTE: `summary.total` for `/Feed` is intentionally bounded to the
 * matching-articles count for the active category filter — NOT a global
 * pre-filter total — because the in-process mode filter (`event-backed`,
 * `recruiting-moves`, `compliance-disclosures`) depends on hydrated
 * event cards and cannot be a Harper condition (see §5.3.3 of the
 * architecture spec).
 * @param category - Normalized feed category, or `"all"` for no filter.
 * @param limit - Page size.
 * @param offset - Row offset.
 * @returns Article page rows plus matching-category row count.
 */
export async function feedArticlePage(
  category: string,
  limit: number,
  offset: number
): Promise<PageAndCount<ArticleRow>> {
  // Harper's `tables.X.search()` requires at least one condition: an
  // empty conditions list crashes the autoCast layer with
  // "Invalid value for attribute publishedDate: 'undefined'" because the
  // planner tries to seed the index with a missing value. For the
  // unfiltered "all" category we use an indexed `publishedDate > epoch`
  // condition which Harper's btree range path handles natively and which
  // does not exclude any real article (every article has a real
  // publishedDate per the schema).
  const conditions: readonly HarperCondition[] =
    category === "all"
      ? [
          {
            attribute: "publishedDate",
            comparator: "greater_than",
            value: "1970-01-01",
          },
        ]
      : [{ attribute: "category", comparator: "equals", value: category }];
  return searchPageAndCount<ArticleRow>(tables.Article, {
    conditions,
    sort: { attribute: "publishedDate", descending: true },
    limit,
    offset,
  });
}

/**
 * Sort + paginate the Advisor table by `lastName` ascending (directory order).
 * @param conditions - Conditions for the Advisor search.
 * @param limit - Page size for the Advisor page.
 * @param offset - Row offset for the Advisor page.
 * @returns Advisor page rows plus the matching count.
 */
export async function advisorDirectoryPage(
  conditions: readonly HarperCondition[],
  limit: number,
  offset: number
): Promise<PageAndCount<AdvisorRow>> {
  return searchPageAndCount<AdvisorRow>(tables.Advisor, {
    conditions,
    sort: { attribute: "lastName" },
    limit,
    offset,
  });
}

const titleCase = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);

const prefixSearchOne = async <T>(
  searchable: SearchableTable<T>,
  attribute: string,
  value: string,
  cap: number
): Promise<readonly T[]> =>
  Array.fromAsync(
    searchable.search({
      conditions: [{ attribute, comparator: "starts_with", value }],
      sort: { attribute },
      limit: cap,
    })
  );

// Harper's `starts_with` comparator does a raw btree range scan
// (spike §0.1 Q2) and is case-sensitive. Real /Search queries arrive
// already lowercased by the resource entry point, but the indexed
// values (`Firm.name`, `Team.name`) are stored with their original
// display casing. Issue parallel range scans for the lowercased and
// title-cased prefix so a query like `"stone"` still matches a
// "Stone Group" team without a separate normalized-name column. The
// alternative — a write-path migration to add `nameLower @indexed` —
// is out of scope for #721.
const prefixSearch = async <T extends IdentifiedRow>(
  table: unknown,
  attribute: string,
  value: string,
  cap: number
): Promise<readonly T[]> => {
  const searchable = table as SearchableTable<T>;
  const lower = value;
  const title = titleCase(value);
  if (lower === title)
    return prefixSearchOne<T>(searchable, attribute, lower, cap);
  const [a, b] = await Promise.all([
    prefixSearchOne<T>(searchable, attribute, lower, cap),
    prefixSearchOne<T>(searchable, attribute, title, cap),
  ]);
  return dedupeById<T>([...a, ...b]).slice(0, cap);
};

/**
 *
 */
interface DedupeAccumulator<T> {
  readonly seen: ReadonlySet<string>;
  readonly out: readonly T[];
}

/**
 * Minimal row shape `dedupeById` reads through.
 */
interface IdentifiedRow {
  readonly id: string;
}

const dedupeById = <T extends IdentifiedRow>(
  rows: readonly T[]
): readonly T[] =>
  rows.reduce<DedupeAccumulator<T>>(
    (acc, row) =>
      acc.seen.has(row.id)
        ? acc
        : {
            seen: new Set([...acc.seen, row.id]),
            out: [...acc.out, row],
          },
    { seen: new Set<string>(), out: [] }
  ).out;
