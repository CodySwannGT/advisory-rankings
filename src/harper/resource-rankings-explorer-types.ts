/**
 * Shared types for the rankings-explorer resource utilities.
 *
 * The producer module (`resource-rankings-explorer.ts`) is still
 * `@ts-nocheck`'d, so this file is the contract that lets the typed
 * utility helpers stay strict. The shapes below mirror the objects the
 * producer's `rankingEntries()` builds and the response payload returned
 * to public callers.
 */

/** Compact firm reference embedded in ranking entries. */
export interface RankingEntryFirm {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly url: string;
}

/** Subject card (advisor / team / firm) attached to a ranking entry. */
export interface RankingEntrySubject {
  readonly kind: string;
  readonly id: string | null;
  readonly displayName: string;
  readonly url: string | null;
}

/** Ranking metadata expanded onto each entry. */
export interface RankingEntryRanking {
  readonly id: string | null;
  readonly publisher: string;
  readonly name: string;
  readonly year: number | null;
  readonly subjectType: string;
  readonly methodologyUrl: string | null;
}

/** Per-axis score state on a ranking entry. */
export interface RankingEntryScoreState {
  readonly value: number | string | null;
  readonly status: "loaded" | "unavailable";
  readonly label: string;
}

/** Bundle of score values surfaced on a ranking entry. */
export interface RankingEntryScores {
  readonly total: RankingEntryScoreState;
  readonly scale: RankingEntryScoreState;
  readonly growth: RankingEntryScoreState;
  readonly professionalism: RankingEntryScoreState;
}

/** Internal sort scratch fields rolled per entry, stripped from public payloads. */
export interface RankingEntrySort {
  readonly category: string;
  readonly firm: string;
  readonly location: string;
  readonly name: string;
  readonly rank: number;
  readonly scale: number;
  readonly growth: number;
  readonly year: number;
}

/** Location slice surfaced on a ranking entry. */
export interface RankingEntryLocation {
  readonly city: string | null;
  readonly state: string | null;
  readonly label: string;
}

/** Source provenance surfaced on a ranking entry. */
export interface RankingEntrySource {
  readonly url: string | null;
  readonly label: string;
  readonly loadedAt: string | null;
}

/**
 * Shape the rankings-explorer producer hands to these utils. Mirrors the
 * object built by `rankingEntries()` in `resource-rankings-explorer.ts`
 * (still `@ts-nocheck`'d), so this interface is the boundary that lets
 * the utils stay strictly typed.
 */
export interface RankingExplorerEntry {
  readonly id: string;
  readonly ranking: RankingEntryRanking;
  readonly rank: number | null;
  readonly subject: RankingEntrySubject;
  readonly firm: RankingEntryFirm | null;
  readonly firmText: string | null;
  readonly location: RankingEntryLocation;
  readonly scores: RankingEntryScores;
  readonly metrics: Readonly<Record<string, number | null>>;
  readonly source: RankingEntrySource;
  readonly resolutionStatus: string;
  readonly sourceStatus: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly _sort: RankingEntrySort;
}

/** Filters parsed off the rankings-explorer route target. */
export interface RankingExplorerFilters {
  readonly category: string | null;
  readonly city: string | null;
  readonly firmId: string | null;
  readonly firmQuery: string | null;
  readonly limit: number;
  readonly resolved: "resolved" | "unresolved" | null;
  readonly sort: string;
  readonly state: string | null;
  readonly year: number | null;
}

/** Sample row retained on coverage and source-status buckets. */
export interface CoverageSampleRow {
  readonly id: string;
  readonly label: string;
  readonly firmText: string | null;
  readonly sourceLabel: string;
  readonly sourceStatus: readonly string[];
}

/** Coverage bucket grouped by `${category}:${year}`. */
export interface CoverageBucket {
  readonly key: string;
  readonly category: string;
  readonly year: number | null;
  readonly query: string;
  readonly total: number;
  readonly resolved: number;
  readonly unresolved: number;
  readonly missingFirm: number;
  readonly missingMarket: number;
  readonly missingScore: number;
  readonly latestLoadedAt: string | null;
  readonly sourceLabels: readonly string[];
  readonly sampleRows: readonly CoverageSampleRow[];
}

/** Bucket grouped by individual source-status code. */
export interface SourceStatusBucket {
  readonly status: string;
  readonly count: number;
  readonly query: string;
  readonly sourceLabels: readonly string[];
  readonly sampleRows: readonly CoverageSampleRow[];
}

/** Per-call summary numbers returned with the rankings explorer payload. */
export interface RankingsSummary {
  readonly totalEntries: number;
  readonly resolvedEntries: number;
  readonly unresolvedEntries: number;
  readonly representedFirms: number;
  readonly representedStates: number;
}

/** Coverage breakdown returned with the rankings explorer payload. */
export interface RankingsCoverage {
  readonly totalEntries: number;
  readonly buckets: readonly CoverageBucket[];
  readonly gapBuckets: readonly SourceStatusBucket[];
  readonly emptyState: string | null;
}

/** Aggregated row in the top-firms breakdown. */
export interface TopFirmRow {
  readonly firm: RankingEntryFirm | null;
  readonly firmText: string;
  readonly count: number;
  readonly sourceIds: readonly string[];
}

/** Facet selectors derived from the loaded entry set. */
export interface RankingsFacets {
  readonly categories: readonly string[];
  readonly years: readonly number[];
  readonly firms: readonly string[];
  readonly states: readonly string[];
}

/** Public ranking entry: same shape as the internal entry minus `_sort`. */
export type PublicRankingEntry = Omit<RankingExplorerEntry, "_sort">;

/**
 * Minimal Harper-style target shape used by `parseFilters`. Mirrors the
 * route-target contract in `src/types/harper-resource.ts` without
 * forcing the strict `RouteTarget` union (the resource passes a
 * `RequestTarget` proxy, and tests pass plain objects with `get`).
 */
export interface FilterTarget {
  readonly get?: (name: string) => unknown;
}
