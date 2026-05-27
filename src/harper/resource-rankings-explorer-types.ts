/**
 * Shared types for the rankings-explorer resource utilities.
 *
 * The producer module (`resource-rankings-explorer-entries.ts`) owns the
 * canonical `RankingExplorerEntry` shape (issue #413 / PR #542). This
 * file re-exports that type and adds the filter / coverage / facets /
 * summary contracts the utility helpers consume so callers have one
 * import path for everything rankings-explorer-related.
 */

export type { RankingExplorerEntry } from "./resource-rankings-explorer-entries.js";
import type { RankingExplorerEntry } from "./resource-rankings-explorer-entries.js";
import type { HarperDate } from "../types/harper-schema.js";

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
  readonly latestLoadedAt: HarperDate | null;
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
  readonly firm: RankingExplorerEntry["firm"];
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
 * Route-target shape accepted by `parseFilters`. Re-exports the project
 * wide `RouteTarget` union so the rankings-explorer producer can pass
 * its `target?: RouteTarget` argument straight through without local
 * narrowing — `parseFilters` runtime-narrows via the `.get` duck check.
 */
export type { RouteTarget as FilterTarget } from "../types/harper-resource.js";
