/**
 * Internal type contracts for the public `RecruitingMarket` resource.
 *
 * These interfaces describe the resource's serialized response shape and the
 * intermediate aggregation rows used while building it. They are intentionally
 * `readonly` end-to-end so reducers and `.map(...)` chains compose without
 * mutating shared state.
 */

import type {
  FirmChip,
  TransitionRow,
  TransitionSubject,
} from "./resource-feed-types.js";
import type {
  PublicWatchlistFilters,
  WatchlistFilters,
  WatchlistMoveSummary,
  WatchlistPayload,
} from "./resource-recruiting-watchlist.js";

/** Compact location payload attached to each recruiting move. */
export interface MoveLocation {
  readonly city: string | null;
  readonly state: string | null;
  readonly label: string | null;
}

/** Compact article payload referenced by a recruiting move. */
export interface MoveArticle {
  readonly id: string;
  readonly headline: string | undefined;
  readonly publishedDate: string | null;
  readonly modifiedDate: string | null;
  readonly url: string | null;
}

/** Provenance attached to each recruiting move payload. */
export interface MoveProvenance {
  readonly sourceTable: "TransitionEvent";
  readonly sourceIds: readonly string[];
  readonly articleMentionIds: readonly string[];
  readonly dealQuoteIds: readonly string[];
}

/**
 * Resolved transition source: article and mention rows linked to one move.
 * `loadedAt` mirrors the article's modified/published date as an ISO-8601
 * string so downstream rendering can sort moves by recency.
 */
export interface TransitionSource {
  readonly article: MoveArticle | null;
  readonly loadedAt: string | null;
  readonly mentionIds: readonly string[];
}

/**
 * Internal recruiting move shape: extends the public `TransitionRow` with
 * the location, article, and source-coverage fields the recruiting market
 * resource aggregates. Structurally a `WatchlistMove`, so it can be passed
 * directly to the watchlist payload builder.
 */
export interface RecruitingMove extends TransitionRow {
  readonly article: MoveArticle | null;
  readonly loadedAt: string | null;
  readonly location: MoveLocation;
  readonly sourceStatus: readonly string[];
  readonly provenance: MoveProvenance;
}

/** Allowed recruiting-direction values for query filtering. */
export type RecruitingDirection = "inbound" | "outbound" | "net";

/** Parsed query filters used by recruiting market aggregations. */
export interface RecruitingFilters extends WatchlistFilters {
  readonly direction: RecruitingDirection;
  readonly firmQuery: string | null;
  readonly limit: number;
  readonly state: string | null;
  readonly year: string | null;
}

/** Public echo of the request filters, returned with each response. */
export interface PublicRecruitingFilters extends PublicWatchlistFilters {
  readonly direction: RecruitingDirection;
  readonly firmId: string | null;
  readonly firmQuery: string | null;
  readonly limit: number;
  readonly state: string | null;
  readonly year: string | null;
}

/** Move summary totals reused for market and overall rollups. */
export type MoveSummary = WatchlistMoveSummary;

/** Per-firm momentum row in the response. */
export interface FirmMomentumRow {
  readonly firm: FirmChip;
  readonly inbound: MoveSummary;
  readonly outbound: MoveSummary;
  readonly netMoveCount: number;
  readonly netKnownAum: number;
  readonly sourceMoveIds: readonly string[];
}

/** Count for one source-status token across the filtered move slice. */
export interface RecruitingSourceStatusCount {
  readonly status: string;
  readonly count: number;
}

/** Source coverage rollup for the same filtered move slice as the response. */
export interface RecruitingSourceCoverage {
  readonly moveCount: number;
  readonly sourceBackedCount: number;
  readonly missingSourceCount: number;
  readonly missingLocationCount: number;
  readonly missingAumCount: number;
  readonly missingT12Count: number;
  readonly statusCounts: readonly RecruitingSourceStatusCount[];
}

/** Intermediate accumulator entry for firm momentum aggregation. */
export interface FirmMomentumAccumulator {
  readonly firm: FirmChip;
  readonly inbound: MoveSummary;
  readonly outbound: MoveSummary;
  readonly sourceMoveIds: readonly string[];
}

/** Market-activity row keyed by city/state label. */
export interface MarketActivityRow {
  readonly market: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly summary: MoveSummary;
  readonly sourceMoveIds: readonly string[];
}

/** Public move payload returned on the response. */
export interface PublicMove {
  readonly id: string;
  readonly subject: TransitionSubject | null;
  readonly fromFirm: FirmChip | null;
  readonly toFirm: FirmChip | null;
  readonly moveDate: TransitionRow["moveDate"];
  readonly aumMoved: number | null;
  readonly productionT12: number | null;
  readonly headcountMoved: number | null;
  readonly deal: TransitionRow["deal"];
  readonly location: MoveLocation;
  readonly article: MoveArticle | null;
  readonly loadedAt: string | null;
  readonly sourceStatus: readonly string[];
  readonly provenance: MoveProvenance;
}

/** Provenance for the overall recruiting market response. */
export interface RecruitingProvenance {
  readonly sourceTables: readonly [
    "TransitionEvent",
    "RecruitingDealQuote",
    "ArticleTransitionEventMention",
    "Article",
    "FirmAlias",
  ];
  readonly sourceIds: readonly string[];
}

/** Top-level recruiting market response payload. */
export interface RecruitingMarketResponse {
  readonly generatedAt: string;
  readonly filters: PublicRecruitingFilters;
  readonly summary: MoveSummary;
  readonly sourceCoverage: RecruitingSourceCoverage;
  readonly firmMomentum: readonly FirmMomentumRow[];
  readonly watchlist: WatchlistPayload | null;
  readonly marketActivity: readonly MarketActivityRow[];
  readonly recentMoves: readonly PublicMove[];
  readonly provenance: RecruitingProvenance;
  readonly emptyState: string | null;
}
