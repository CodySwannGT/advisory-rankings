import type { ResourceIndex } from "./resource-data.js";
import type { RankingSortFields } from "./resource-rankings-explorer-entries.js";
import type {
  FilterTarget,
  PublicRankingEntry,
  RankingExplorerEntry,
  RankingExplorerFilters,
  RankingsFacets,
  RankingsSummary,
  TopFirmRow,
} from "./resource-rankings-explorer-types.js";
import { resolveFirm } from "./resource-routing.js";

export { rankingsCoverage } from "./resource-rankings-explorer-coverage.js";

/**
 * Builds the canonical RankingExplorerFilters object from the request's URL parameter map,
 * resolving firm queries against the index and applying defensive bounds to numeric inputs.
 * @param target Harper URLSearchParams-like filter target, or null when none was supplied.
 * @param db Resource index used to translate a firm name/id into a real firm record.
 * @returns A fully populated, sanitized filter object.
 */
export function parseFilters(
  target: FilterTarget | null | undefined,
  db: ResourceIndex
): RankingExplorerFilters {
  const firmQuery = readTarget(target, "firm");
  const firm = firmQuery ? resolveFirm(db, firmQuery) : null;
  return {
    category: clean(readTarget(target, "category")),
    city: clean(readTarget(target, "city"))?.toLowerCase() ?? null,
    firmId: firm?.id ?? null,
    firmQuery,
    limit: boundedNumber(readTarget(target, "limit"), 50, 1, 200),
    resolved: resolvedFilter(readTarget(target, "resolved")),
    sort: sortFilter(readTarget(target, "sort")),
    state: normalizeState(readTarget(target, "state")),
    year: normalizeYear(readTarget(target, "year")),
  };
}

/**
 * Defensively reads one URL parameter via duck-typed `get`, tolerating non-object targets.
 * @param target Possible URLSearchParams-shaped value.
 * @param name Parameter name to read.
 * @returns The parameter as a string, or null when missing or empty.
 */
function readTarget(
  target: FilterTarget | null | undefined,
  name: string
): string | null {
  if (target == null || typeof target !== "object") return null;
  const get = Reflect.get(target, "get");
  if (typeof get !== "function") return null;
  const raw: unknown = get.call(target, name);
  if (raw == null) return null;
  const text = String(raw);
  return text || null;
}

/**
 * Applies every filter predicate to each entry, keeping only those that pass all of them.
 * @param entries Source entries.
 * @param filters Active filter object.
 * @returns Entries that satisfy every active filter.
 */
export function filteredEntries(
  entries: readonly RankingExplorerEntry[],
  filters: RankingExplorerFilters
): readonly RankingExplorerEntry[] {
  return entries.filter(entry =>
    filterPredicates(entry, filters).every(Boolean)
  );
}

/**
 * Builds the per-entry boolean array used by `filteredEntries`, with one slot per filter dimension.
 * @param entry Candidate entry.
 * @param filters Active filter object.
 * @returns Array of match booleans, one per filter dimension.
 */
function filterPredicates(
  entry: RankingExplorerEntry,
  filters: RankingExplorerFilters
): readonly boolean[] {
  return [
    !filters.category || entry.ranking.name === filters.category,
    !filters.year || entry.ranking.year === filters.year,
    !filters.state || entry.location.state === filters.state,
    !filters.city ||
      String(entry.location.city ?? "")
        .toLowerCase()
        .includes(filters.city),
    !filters.firmId || entry.firm?.id === filters.firmId,
    !filters.resolved || entry.resolutionStatus === filters.resolved,
  ];
}

const SORT_KEYS = [
  "rank",
  "scale",
  "growth",
  "firm",
  "location",
  "name",
  "category",
  "year",
] as const satisfies readonly (keyof RankingSortFields)[];

/**
 * Parses a sort token like `-rank` into the underlying sort-field name, with `rank` as fallback.
 * @param sort Raw sort token, possibly prefixed with `-` for descending.
 * @returns A known sort-field key.
 */
function parseSortKey(sort: string): keyof RankingSortFields {
  const stripped = sort.replace(/^-/, "");
  const match = SORT_KEYS.find(candidate => candidate === stripped);
  return match ?? "rank";
}

/**
 * Returns a new array of entries sorted by the requested field/direction, putting missing numeric
 * values last so they don't pollute the top of the list.
 * @param entries Source entries (not mutated).
 * @param sort Sort token, possibly prefixed with `-` for descending.
 * @returns A new sorted array.
 */
export function sortEntries(
  entries: readonly RankingExplorerEntry[],
  sort: string
): readonly RankingExplorerEntry[] {
  const direction = sort.startsWith("-") ? -1 : 1;
  const key = parseSortKey(sort);
  return [...entries].sort((left, right) => {
    const leftValue = left._sort[key] ?? "";
    const rightValue = right._sort[key] ?? "";
    if (key === "rank" || key === "scale" || key === "growth")
      return compareNumeric(Number(leftValue), Number(rightValue), direction);
    if (typeof leftValue === "number" && typeof rightValue === "number")
      return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
}

/**
 * Numeric comparator that always sends NaN/Infinity values to the end of the sort.
 * @param left Left value.
 * @param right Right value.
 * @param direction 1 for ascending, -1 for descending.
 * @returns Standard comparator result.
 */
function compareNumeric(
  left: number,
  right: number,
  direction: number
): number {
  const leftMissing = !Number.isFinite(left);
  const rightMissing = !Number.isFinite(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return (left - right) * direction;
}

/**
 * Aggregates totals across the filtered rankings slice for the explorer header strip.
 * @param entries Filtered entries to summarise.
 * @returns Counts of total/resolved/unresolved rows plus the unique firm and state counts.
 */
export function summarize(
  entries: readonly RankingExplorerEntry[]
): RankingsSummary {
  const firms = new Set(
    entries.map(entry => entry.firm?.id).filter((id): id is string => !!id)
  );
  const states = new Set(
    entries
      .map(entry => entry.location.state)
      .filter((state): state is string => !!state)
  );
  return {
    totalEntries: entries.length,
    resolvedEntries: entries.filter(row => row.resolutionStatus === "resolved")
      .length,
    unresolvedEntries: entries.filter(
      row => row.resolutionStatus !== "resolved"
    ).length,
    representedFirms: firms.size,
    representedStates: states.size,
  };
}

/**
 * Groups entries by firm and returns the leaderboard rows, ordered by count then firm name.
 * @param entries Filtered entries to roll up.
 * @returns Top-firm rows ready for UI rendering.
 */
export function topFirms(
  entries: readonly RankingExplorerEntry[]
): readonly TopFirmRow[] {
  const grouped = Map.groupBy(
    entries,
    entry => entry.firm?.id || entry.firmText || "Unknown firm"
  );
  const rows = Array.from(grouped, ([, items]) =>
    items.reduce<TopFirmRow>(mergeFirmEntry, {
      firm: items[0]!.firm,
      firmText: items[0]!.firmText || items[0]!.firm?.name || "Unknown firm",
      count: 0,
      sourceIds: [],
    })
  );
  return [...rows].sort(
    (left, right) =>
      right.count - left.count || left.firmText.localeCompare(right.firmText)
  );
}

/**
 * Reducer folding one entry into a top-firm row, growing the count and source-id list.
 * @param row Accumulator row.
 * @param entry Entry being merged in.
 * @returns The updated row.
 */
function mergeFirmEntry(
  row: TopFirmRow,
  entry: RankingExplorerEntry
): TopFirmRow {
  return {
    ...row,
    count: row.count + 1,
    sourceIds: [...row.sourceIds, entry.id],
  };
}

/**
 * Computes the facet lists used by the explorer's filter controls (categories, years, firms, states).
 * @param entries Source entries to derive facets from.
 * @returns Sorted, de-duplicated facet lists.
 */
export function facets(
  entries: readonly RankingExplorerEntry[]
): RankingsFacets {
  const years = uniqueSorted(
    entries
      .map(entry => entry.ranking.year)
      .filter((year): year is number => year != null)
  );
  return {
    categories: uniqueSorted(entries.map(entry => entry.ranking.name)),
    years: [...years].sort((left, right) => right - left),
    firms: uniqueSorted(
      entries
        .map(entry => entry.firmText)
        .filter((text): text is string => !!text)
    ),
    states: uniqueSorted(
      entries
        .map(entry => entry.location.state)
        .filter((state): state is string => !!state)
    ),
  };
}

/**
 * Strips the internal `_sort` index off an entry so the wire-facing object stays narrow.
 * @param entry Internal entry shape.
 * @returns The same entry without internal sort metadata.
 */
export function publicEntry(entry: RankingExplorerEntry): PublicRankingEntry {
  const { _sort: _omitSort, ...publicRow } = entry;
  return publicRow;
}

/**
 * Returns a defensive copy of the filter object so callers can echo it back to clients without leaking
 * internal mutation.
 * @param filters Filter object to clone.
 * @returns A shallow copy with the same fields.
 */
export function publicFilters(
  filters: RankingExplorerFilters
): RankingExplorerFilters {
  return {
    category: filters.category,
    city: filters.city,
    firmId: filters.firmId,
    firmQuery: filters.firmQuery,
    limit: filters.limit,
    resolved: filters.resolved,
    sort: filters.sort,
    state: filters.state,
    year: filters.year,
  };
}

/**
 * Normalises a free-text state input to upper-case to match canonical state codes.
 * @param value Raw input value.
 * @returns The upper-cased state, or null when input was empty.
 */
export function normalizeState(value: unknown): string | null {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

/**
 * Trims and string-coerces an unknown value, returning null when the result is empty.
 * @param value Raw input value.
 * @returns The trimmed string, or null when empty.
 */
function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

/**
 * Parses an unknown value as a calendar year above 1900, rejecting non-integers.
 * @param value Raw input value.
 * @returns The parsed year, or null when invalid.
 */
function normalizeYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 ? year : null;
}

/**
 * Parses a numeric input, clamps it into [min, max], and falls back when it is missing/invalid.
 * @param value Raw input value.
 * @param fallback Value to use when input is missing/invalid.
 * @param min Inclusive minimum after clamping.
 * @param max Inclusive maximum after clamping.
 * @returns The bounded integer.
 */
function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

/**
 * Coerces a raw resolved-filter input to the allowed enum, rejecting anything else.
 * @param value Raw input value.
 * @returns The valid filter value, or null when invalid.
 */
function resolvedFilter(value: unknown): "resolved" | "unresolved" | null {
  if (value === "resolved" || value === "unresolved") return value;
  return null;
}

/**
 * Coerces a raw sort token to one of the allowed sort options, defaulting to `rank`.
 * @param value Raw input value.
 * @returns A valid sort token.
 */
function sortFilter(value: unknown): string {
  const allowed = [
    "rank",
    "-rank",
    "scale",
    "-scale",
    "growth",
    "-growth",
    "firm",
    "location",
    "name",
  ];
  return typeof value === "string" && allowed.includes(value) ? value : "rank";
}

/**
 * De-duplicates a value array and sorts it lexicographically, dropping null/undefined entries.
 * @param values Input values.
 * @returns The deduped, sorted array.
 */
function uniqueSorted<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values.filter(value => value != null))].sort(
    (left, right) => String(left).localeCompare(String(right))
  );
}
