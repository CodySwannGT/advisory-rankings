/**
 * `/PublicAdvisors` query-plan dispatcher. The class body lives in
 * `resource-directory-endpoints.ts`; the actual query branches live
 * here so the endpoint module stays under the project's
 * `max-lines: 300` ceiling. See `.claude/scratch/issue-721-architecture.md`
 * §5.1 for the design rationale (token index for `q`, indexed `firmId`
 * employment lookup for `firm`, Harper-native paginated
 * `search({conditions, sort, limit, offset})` for the no-`q`/no-`firm`
 * directory listing).
 */
import type { AdvisorRow } from "../types/harper-schema.js";
import type {
  AdvisorDirectoryFilters,
  AdvisorDirectoryRow,
  DirectoryPage,
} from "./resource-directory-types.js";
import { encodeOffsetCursor } from "./resource-pagination.js";
import { advisorMatchesNonFirmFilters } from "./resource-directory-filters.js";
import { advisorsMatchingFirm } from "./resource-directory-advisor-firm.js";
import { compareAdvisorDirectoryRows } from "./resource-directory-sorting.js";
import { advisorReadiness } from "./resource-advisor-readiness.js";
import {
  advisorDirectoryPage,
  rowsByIds,
  type HarperCondition,
} from "./resource-directory-search-queries.js";
import { searchAdvisorsByTokens } from "./resource-advisor-token-query.js";

/** Augmented directory-page shape including the optional cap-trip flag. */
export interface TruncatedDirectoryPage<T> extends DirectoryPage<T> {
  readonly truncated?: boolean;
}

/** Accumulator shape for bounded derived-readiness scans. */
interface ReadinessMatchScanResult {
  readonly matched: ReadonlyArray<AdvisorRow>;
  readonly truncated: boolean;
}

/** Narrow Harper table surface used for derived readiness filtering. */
type SearchableAdvisorTable = Readonly<
  Record<
    "search",
    (query: Readonly<Record<string, unknown>>) => AsyncIterable<AdvisorRow>
  >
>;

const READINESS_SEARCH_PAGE_LIMIT = 100;
const READINESS_SCAN_LIMIT = 10_000;

/**
 * Picks the most selective indexed condition for the
 * `/PublicAdvisors` request shape and routes to the matching query
 * branch. Each branch returns a fully-built directory page; this
 * function never touches Harper itself.
 * @param filters - Parsed advisor directory filters.
 * @param offset - Decoded offset cursor.
 * @param limit - Page size.
 * @returns Directory page with optional truncation flag.
 */
export async function runAdvisorDirectoryQuery(
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> {
  if (filters.q && filters.firm) {
    return tokenFirmQuery(filters, offset, limit);
  }
  if (filters.q) {
    return tokenOnlyQuery(filters, offset, limit);
  }
  if (filters.firm) {
    return firmOnlyQuery(filters, offset, limit);
  }
  return harperNativeQuery(filters, offset, limit);
}

/**
 * Builds Harper-native `conditions[]` for the AND-planner from the
 * advisor directory's careerStatus and hasCrd filters. Per spike §0.1
 * Q1 the planner picks the most-selective indexed condition as the
 * range seed and applies the rest as row predicates; per Q5
 * `equals null`/`ne null` work natively on `@indexed` attributes so
 * `hasCrd` stays indexed instead of falling back to in-memory.
 * @param filters - Parsed advisor directory filters.
 * @returns Conditions array (possibly empty).
 */
function buildAdvisorConditions(
  filters: AdvisorDirectoryFilters
): readonly HarperCondition[] {
  const careerStatusCondition: HarperCondition | null = filters.careerStatus
    ? {
        attribute: "careerStatus",
        comparator: "equals",
        value: filters.careerStatus,
      }
    : null;
  const hasCrdCondition: HarperCondition | null =
    filters.hasCrd === true
      ? { attribute: "finraCrd", comparator: "greater_than", value: "" }
      : filters.hasCrd === false
        ? { attribute: "finraCrd", comparator: "equals", value: null }
        : null;
  return [careerStatusCondition, hasCrdCondition].filter(
    (condition): condition is HarperCondition => condition !== null
  );
}

const harperNativeQuery = async (
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> => {
  if (requiresDerivedReadinessScan(filters)) {
    return derivedReadinessQuery(filters, offset, limit);
  }
  const conditions = buildAdvisorConditions(filters);
  const { items, total } = await advisorDirectoryPage(
    conditions,
    limit,
    offset
  );
  return finalizePage(items, total, offset, false);
};

const tokenOnlyQuery = async (
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> => {
  const tokenResult = await searchAdvisorsByTokens(
    tables.AdvisorSearchIndex,
    filters.q
  );
  const hydrated = await rowsByIds<AdvisorRow>(tables.Advisor, tokenResult.ids);
  // The q-substring portion has already been satisfied by the token
  // index; only the non-q advisor-field filters apply here.
  const remaining: AdvisorDirectoryFilters = { ...filters, q: "" };
  const filtered = hydrated.filter(advisor =>
    advisorMatchesNonFirmFilters(advisor, remaining)
  );
  return finalizeInMemory(filtered, offset, limit, tokenResult.truncated);
};

const firmOnlyQuery = async (
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> => {
  const matched = await advisorsMatchingFirm(filters, filters.firm);
  return finalizeInMemory(matched, offset, limit, false);
};

const tokenFirmQuery = async (
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> => {
  const filtersWithoutQ: AdvisorDirectoryFilters = { ...filters, q: "" };
  const [tokenResult, firmAdvisors] = await Promise.all([
    searchAdvisorsByTokens(tables.AdvisorSearchIndex, filters.q),
    advisorsMatchingFirm(filtersWithoutQ, filters.firm),
  ]);
  const tokenIdSet = new Set(tokenResult.ids);
  const intersected = firmAdvisors.filter(advisor =>
    tokenIdSet.has(advisor.id)
  );
  return finalizeInMemory(intersected, offset, limit, tokenResult.truncated);
};

const requiresDerivedReadinessScan = (
  filters: AdvisorDirectoryFilters
): boolean =>
  Boolean(
    filters.contactReadiness || filters.profileSubstance || filters.freshness
  );

const derivedReadinessQuery = async (
  filters: AdvisorDirectoryFilters,
  offset: number,
  limit: number
): Promise<TruncatedDirectoryPage<AdvisorDirectoryRow>> => {
  const conditions = buildAdvisorConditions(filters);
  const searchable = tables.Advisor as unknown as SearchableAdvisorTable;
  const { matched, truncated } = await collectReadinessMatches(
    searchable,
    conditions,
    filters,
    offset + limit + 1
  );
  return finalizeInMemory(matched, offset, limit, truncated);
};

const collectReadinessMatches = async (
  searchable: SearchableAdvisorTable,
  conditions: readonly HarperCondition[],
  filters: AdvisorDirectoryFilters,
  targetMatches: number,
  scanned = 0,
  matched: ReadonlyArray<AdvisorRow> = []
): Promise<ReadinessMatchScanResult> => {
  if (scanned >= READINESS_SCAN_LIMIT || matched.length >= targetMatches) {
    return { matched, truncated: true };
  }
  const batch = await Array.fromAsync(
    searchable.search({
      conditions,
      sort: { attribute: "lastName" },
      limit: READINESS_SEARCH_PAGE_LIMIT,
      offset: scanned,
    })
  );
  const nextMatched = [
    ...matched,
    ...batch.filter(advisor => advisorMatchesNonFirmFilters(advisor, filters)),
  ];
  if (nextMatched.length >= targetMatches) {
    return { matched: nextMatched.slice(0, targetMatches), truncated: true };
  }
  return batch.length < READINESS_SEARCH_PAGE_LIMIT
    ? { matched: nextMatched, truncated: false }
    : collectReadinessMatches(
        searchable,
        conditions,
        filters,
        targetMatches,
        scanned + batch.length,
        nextMatched
      );
};

const finalizePage = (
  items: readonly AdvisorRow[],
  total: number,
  offset: number,
  truncated: boolean
): TruncatedDirectoryPage<AdvisorDirectoryRow> => {
  const nextCursor =
    offset + items.length < total
      ? encodeOffsetCursor(offset + items.length)
      : null;
  const base: DirectoryPage<AdvisorDirectoryRow> = {
    items: items.map(publicAdvisorDirectoryRow),
    nextCursor,
    total,
  };
  return truncated ? { ...base, truncated: true } : base;
};

const finalizeInMemory = (
  matched: readonly AdvisorRow[],
  offset: number,
  limit: number,
  truncated: boolean
): TruncatedDirectoryPage<AdvisorDirectoryRow> => {
  const sorted = [...matched].sort(compareAdvisorDirectoryRows);
  const page = sorted.slice(offset, offset + limit);
  return finalizePage(page, sorted.length, offset, truncated);
};

const publicAdvisorDirectoryRow = (
  advisor: AdvisorRow
): AdvisorDirectoryRow => {
  const finraCrd = advisor.finraCrd || null;
  return {
    ...advisor,
    finraCrd,
    hasCrd: finraCrd !== null,
    readiness: advisorReadiness({ ...advisor, finraCrd }),
  };
};
