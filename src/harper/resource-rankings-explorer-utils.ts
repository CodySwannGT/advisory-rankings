/* eslint-disable jsdoc/require-jsdoc -- Private resource helpers are covered through the public endpoint. */
import type { ResourceIndex } from "./resource-data.js";
import type {
  FilterTarget,
  PublicRankingEntry,
  RankingExplorerEntry,
  RankingExplorerFilters,
  RankingEntrySort,
  RankingsFacets,
  RankingsSummary,
  TopFirmRow,
} from "./resource-rankings-explorer-types.js";
import { resolveFirm } from "./resource-routing.js";

export { rankingsCoverage } from "./resource-rankings-explorer-coverage.js";

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

function readTarget(
  target: FilterTarget | null | undefined,
  name: string
): string | null {
  const raw = target?.get?.(name);
  if (raw == null) return null;
  const text = String(raw);
  return text || null;
}

export function filteredEntries(
  entries: readonly RankingExplorerEntry[],
  filters: RankingExplorerFilters
): readonly RankingExplorerEntry[] {
  return entries.filter(entry =>
    filterPredicates(entry, filters).every(Boolean)
  );
}

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
] as const satisfies readonly (keyof RankingEntrySort)[];

function parseSortKey(sort: string): keyof RankingEntrySort {
  const stripped = sort.replace(/^-/, "");
  const match = SORT_KEYS.find(candidate => candidate === stripped);
  return match ?? "rank";
}

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

export function publicEntry(entry: RankingExplorerEntry): PublicRankingEntry {
  const { _sort: _omitSort, ...publicRow } = entry;
  return publicRow;
}

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

export function normalizeState(value: unknown): string | null {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 ? year : null;
}

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

function resolvedFilter(value: unknown): "resolved" | "unresolved" | null {
  if (value === "resolved" || value === "unresolved") return value;
  return null;
}

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

function uniqueSorted<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values.filter(value => value != null))].sort(
    (left, right) => String(left).localeCompare(String(right))
  );
}

/* eslint-enable jsdoc/require-jsdoc -- End local helper exception. */
