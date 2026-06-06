/**
 * Aggregation helpers for the public `RecruitingMarket` resource.
 *
 * Split out of `resource-recruiting-market.ts` so the response class stays
 * inside the project's per-file line budget. The functions here are
 * cast-free and operate on the typed shapes declared in
 * `resource-recruiting-market-types.ts`. Small primitive utilities
 * (number/date/query normalizers) live in
 * `resource-recruiting-market-utils.ts`.
 */

import type {
  ArticleRow,
  BranchRow,
  TransitionEventRow,
} from "../types/harper-schema.js";
import type { FirmChip, TransitionRow } from "./resource-feed-types.js";
import type { ResourceIndex } from "./resource-data.js";
import type { WatchlistMove } from "./resource-recruiting-watchlist.js";
import type {
  FirmMomentumAccumulator,
  FirmMomentumRow,
  MarketActivityRow,
  MoveArticle,
  MoveLocation,
  MoveSummary,
  PublicMove,
  RecruitingDirection,
  RecruitingFilters,
  RecruitingMove,
  TransitionSource,
} from "./resource-recruiting-market-types.js";

import { firmChip, transitionRow } from "./resource-feed.js";
import * as watchlist from "./resource-recruiting-watchlist.js";
import {
  dateDesc,
  isNonEmptyString,
  toIsoOrNull,
} from "./resource-recruiting-market-utils.js";

/**
 * Lifts every stored TransitionEvent into a RecruitingMove, dropping rows that the feed layer can't
 * shape into a TransitionRow.
 * @param db Resource index providing transitions, mentions, and firm/branch lookup maps.
 * @returns The hydrated recruiting-move list.
 */
export function recruitingMoves(db: ResourceIndex): readonly RecruitingMove[] {
  return db.transitions.flatMap((transition): readonly RecruitingMove[] => {
    const row = transitionRow(transition, db);
    if (!row) return [];
    return [buildRecruitingMove(db, transition, row)];
  });
}

/**
 * Combines a transition's feed row, source article, branch, and provenance into one RecruitingMove.
 * @param db Resource index used for source/branch lookups.
 * @param transition Source transition row.
 * @param row Feed-shaped transition row for the same transition.
 * @returns The fully assembled recruiting move.
 */
function buildRecruitingMove(
  db: ResourceIndex,
  transition: TransitionEventRow,
  row: TransitionRow
): RecruitingMove {
  const source = transitionSource(db, transition.id);
  const branch = transitionBranch(db, transition);
  const location = buildMoveLocation(branch);
  return {
    ...row,
    id: transition.id,
    article: source.article,
    loadedAt: source.loadedAt,
    location,
    sourceStatus: sourceStatus(row, source.article, branch),
    provenance: {
      sourceTable: "TransitionEvent",
      sourceIds: [transition.id],
      articleMentionIds: source.mentionIds,
      dealQuoteIds: transition.recruitingDealId
        ? [transition.recruitingDealId]
        : [],
    },
  };
}

/**
 * Builds the move's location pair from a branch row, computing a `"City, ST"` label when present.
 * @param branch Branch row or null.
 * @returns The move-location object.
 */
function buildMoveLocation(branch: BranchRow | null): MoveLocation {
  return {
    city: branch?.city ?? null,
    state: branch?.state ?? null,
    label:
      [branch?.city, branch?.state].filter(isNonEmptyString).join(", ") || null,
  };
}

/**
 * Finds the most-recently-published article tied to a transition and condenses it into a TransitionSource.
 * @param db Resource index providing mentions and article lookups.
 * @param transitionId Transition id to source.
 * @returns Article, loadedAt timestamp, and mention id list.
 */
function transitionSource(
  db: ResourceIndex,
  transitionId: string
): TransitionSource {
  const mentions = db.mTE.filter(
    mention => mention.transitionEventId === transitionId
  );
  const article = mentions
    .map(mention => db.byArticle.get(mention.articleId))
    .filter((row): row is ArticleRow => Boolean(row))
    .slice()
    .sort(dateDesc("publishedDate"))[0];
  const loadedRaw = article?.modifiedDate ?? article?.publishedDate ?? null;
  return {
    article: article ? toMoveArticle(article) : null,
    loadedAt: toIsoOrNull(loadedRaw),
    mentionIds: mentions.map(mention => mention.id).filter(isNonEmptyString),
  };
}

/**
 * Projects an ArticleRow into the slim MoveArticle representation surfaced to clients.
 * @param article Source article row.
 * @returns The MoveArticle.
 */
function toMoveArticle(article: ArticleRow): MoveArticle {
  return {
    id: article.id,
    headline: article.headline,
    publishedDate: toIsoOrNull(article.publishedDate),
    modifiedDate: toIsoOrNull(article.modifiedDate),
    url: article.url ?? null,
  };
}

/**
 * Resolves a transition's branch, preferring the destination branch over the origin.
 * @param db Resource index providing branch lookups.
 * @param transition Source transition row.
 * @returns The selected branch, or null when neither end is known.
 */
function transitionBranch(
  db: ResourceIndex,
  transition: TransitionEventRow
): BranchRow | null {
  if (transition.toBranchId) {
    const toBranch = db.byBranch.get(transition.toBranchId);
    if (toBranch) return toBranch;
  }
  if (transition.fromBranchId) {
    const fromBranch = db.byBranch.get(transition.fromBranchId);
    if (fromBranch) return fromBranch;
  }
  return null;
}

/**
 * Filters the recruiting-move list by year/state/direction, including watchlist-derived firm scoping.
 * @param moves Full move list.
 * @param filters Active filter object.
 * @returns Moves passing every filter dimension.
 */
export function filteredMoves(
  moves: readonly RecruitingMove[],
  filters: RecruitingFilters
): readonly RecruitingMove[] {
  const firmIds = watchlist.firmIdsForFilter(filters);
  return moves.filter(move => matchesFilters(move, filters, firmIds));
}

/**
 * Composes the per-move filter predicate, short-circuiting on year/state and delegating direction matching.
 * @param move Candidate move.
 * @param filters Active filter object.
 * @param firmIds Watchlist-derived firm ids; empty when no firm filter is active.
 * @returns True when the move passes every filter.
 */
function matchesFilters(
  move: RecruitingMove,
  filters: RecruitingFilters,
  firmIds: readonly string[]
): boolean {
  if (!matchesYear(move, filters.year)) return false;
  if (!matchesState(move, filters.state)) return false;
  if (firmIds.length === 0) return true;
  return matchesDirection(move, filters.direction, firmIds);
}

/**
 * Checks whether a move's date starts with the requested year string.
 * @param move Candidate move.
 * @param year Year filter (e.g. `"2024"`) or null.
 * @returns True when no year filter is set or the move matches it.
 */
function matchesYear(move: RecruitingMove, year: string | null): boolean {
  if (!year) return true;
  return String(move.moveDate ?? "").startsWith(year);
}

/**
 * Checks whether a move's destination state matches the filter.
 * @param move Candidate move.
 * @param state State filter or null.
 * @returns True when no state filter is set or the move matches it.
 */
function matchesState(move: RecruitingMove, state: string | null): boolean {
  if (!state) return true;
  return move.location.state === state;
}

/**
 * Checks whether a move's inbound/outbound firm matches the watchlist scope, honoring direction.
 * @param move Candidate move.
 * @param direction Direction filter (`inbound`, `outbound`, or both).
 * @param firmIds Watchlist firm ids to compare against.
 * @returns True when the move qualifies for the given direction.
 */
function matchesDirection(
  move: RecruitingMove,
  direction: RecruitingDirection,
  firmIds: readonly string[]
): boolean {
  const inboundHit = move.toFirm ? firmIds.includes(move.toFirm.id) : false;
  const outboundHit = move.fromFirm
    ? firmIds.includes(move.fromFirm.id)
    : false;
  if (direction === "inbound") return inboundHit;
  if (direction === "outbound") return outboundHit;
  return inboundHit || outboundHit;
}

/**
 * Computes per-firm momentum stats (inbound vs outbound) across a move set, returning rows sorted by net AUM.
 * @param db Resource index used to refresh firm chips for the final rows.
 * @param moves Filtered recruiting moves.
 * @returns Firm momentum rows ordered by descending net known AUM.
 */
export function firmMomentum(
  db: ResourceIndex,
  moves: readonly RecruitingMove[]
): readonly FirmMomentumRow[] {
  const byFirm = moves.reduce<ReadonlyMap<string, FirmMomentumAccumulator>>(
    (acc, move) => {
      const withInbound = foldFirmMove(acc, move.toFirm, "inbound", move);
      return foldFirmMove(withInbound, move.fromFirm, "outbound", move);
    },
    new Map()
  );
  return [...byFirm.values()]
    .map(toFirmMomentumRow)
    .sort((left, right) => right.netKnownAum - left.netKnownAum)
    .map(row => ({
      ...row,
      firm: firmChip(db.byFirm.get(row.firm.id)) ?? row.firm,
    }));
}

/**
 * Finalises an accumulator into a publishable momentum row by computing net counts and AUM.
 * @param row Accumulator row.
 * @returns The finalised momentum row.
 */
function toFirmMomentumRow(row: FirmMomentumAccumulator): FirmMomentumRow {
  return {
    ...row,
    netMoveCount: row.inbound.count - row.outbound.count,
    netKnownAum: row.inbound.knownAum - row.outbound.knownAum,
  };
}

/**
 * Folds one (firm, direction, move) tuple into the per-firm accumulator map, returning a new map.
 * @param byFirm Accumulator map.
 * @param firm Firm chip on the chosen side of the move; ignored when null.
 * @param direction Whether the firm received (`inbound`) or lost (`outbound`) the team.
 * @param move The move being merged in.
 * @returns The updated accumulator map.
 */
function foldFirmMove(
  byFirm: ReadonlyMap<string, FirmMomentumAccumulator>,
  firm: FirmChip | null,
  direction: "inbound" | "outbound",
  move: RecruitingMove
): ReadonlyMap<string, FirmMomentumAccumulator> {
  if (!firm?.id) return byFirm;
  const previous: FirmMomentumAccumulator = byFirm.get(firm.id) ?? {
    firm,
    inbound: emptySummary(),
    outbound: emptySummary(),
    sourceMoveIds: [],
  };
  const updated: FirmMomentumAccumulator = {
    ...previous,
    [direction]: addToSummary(previous[direction], move),
    sourceMoveIds: [...previous.sourceMoveIds, move.id],
  };
  return new Map(byFirm).set(firm.id, updated);
}

/**
 * Groups moves by location label and returns the per-market activity rollups sorted by known AUM.
 * @param moves Filtered recruiting moves.
 * @returns Market-activity rows ordered for display.
 */
export function marketActivity(
  moves: readonly RecruitingMove[]
): readonly MarketActivityRow[] {
  const byMarket = moves.reduce<ReadonlyMap<string, MarketActivityRow>>(
    foldMarketActivity,
    new Map()
  );
  return [...byMarket.values()].sort(
    (left, right) =>
      right.summary.knownAum - left.summary.knownAum ||
      right.summary.count - left.summary.count
  );
}

/**
 * Folds one move into its market-activity bucket, keying on `location.label` with a safe fallback.
 * @param acc Accumulator map.
 * @param move Move being merged.
 * @returns The updated accumulator map.
 */
function foldMarketActivity(
  acc: ReadonlyMap<string, MarketActivityRow>,
  move: RecruitingMove
): ReadonlyMap<string, MarketActivityRow> {
  const key = move.location.label ?? "Unknown market";
  const previous: MarketActivityRow = acc.get(key) ?? {
    market: key,
    city: move.location.city,
    state: move.location.state,
    summary: emptySummary(),
    sourceMoveIds: [],
  };
  const updated: MarketActivityRow = {
    ...previous,
    summary: addToSummary(previous.summary, move),
    sourceMoveIds: [...previous.sourceMoveIds, move.id],
  };
  return new Map(acc).set(key, updated);
}

/**
 * Reduces a move list into the totals summary surfaced on the recruiting dashboard header.
 * @param moves Move list.
 * @returns Aggregated summary.
 */
export function summarizeMoves(moves: readonly RecruitingMove[]): MoveSummary {
  return moves.reduce(addToSummary, emptySummary());
}

/**
 * Constructs the zeroed summary used as the seed for every reducer in this module.
 * @returns A summary with all counters at 0.
 */
export function emptySummary(): MoveSummary {
  return { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 };
}

/**
 * Folds one move into an existing summary, advancing counts and known-AUM/missing-T12 tallies.
 * @param summary Current summary.
 * @param move Move to merge.
 * @returns The updated summary.
 */
export function addToSummary(
  summary: MoveSummary,
  move: WatchlistMove
): MoveSummary {
  const hasAumValue = move.aumMoved != null && move.aumMoved !== "";
  const aum = Number(move.aumMoved);
  const hasKnownAum = hasAumValue && Number.isFinite(aum);
  const hasT12Value = move.productionT12 != null && move.productionT12 !== "";
  const t12 = Number(move.productionT12);
  return {
    count: summary.count + 1,
    knownAum: summary.knownAum + (hasKnownAum ? aum : 0),
    unknownAumCount: summary.unknownAumCount + (hasKnownAum ? 0 : 1),
    missingT12Count:
      summary.missingT12Count + (hasT12Value && Number.isFinite(t12) ? 0 : 1),
  };
}

/**
 * Projects an internal RecruitingMove into the client-facing PublicMove, stripping non-public fields.
 * @param move Internal move shape.
 * @returns The public move payload.
 */
export function publicMove(move: RecruitingMove): PublicMove {
  return {
    id: move.id,
    subject: move.subject,
    fromFirm: move.fromFirm,
    toFirm: move.toFirm,
    moveDate: move.moveDate,
    aumMoved: move.aumMoved ?? null,
    productionT12: move.productionT12 ?? null,
    headcountMoved: move.headcountMoved ?? null,
    deal: move.deal,
    location: move.location,
    article: move.article,
    loadedAt: move.loadedAt,
    sourceStatus: move.sourceStatus,
    provenance: move.provenance,
  };
}

/**
 * Builds the move's status-code list, emitting one code per missing/unresolved aspect of the row.
 * @param move Feed-shaped transition row.
 * @param article Resolved source article or null.
 * @param branch Resolved branch row or null.
 * @returns Ordered list of source-status codes.
 */
function sourceStatus(
  move: TransitionRow,
  article: MoveArticle | null,
  branch: BranchRow | null
): readonly string[] {
  return [
    article ? "source-backed" : "missing-source",
    move.subject ? null : "unresolved-entity",
    move.aumMoved == null ? "missing-aum" : null,
    move.productionT12 == null ? "missing-t12" : null,
    ...dealStatus(move),
    branch ? null : "missing-location",
  ].filter(isNonEmptyString);
}

/**
 * Builds explicit status codes for recruiting-deal economics.
 * @param move Feed-shaped transition row.
 * @returns Missing-deal or per-field missing codes.
 */
function dealStatus(move: TransitionRow): readonly (string | null)[] {
  const deal = move.deal;
  if (!deal) return ["missing-deal-terms"];
  return [
    deal.upfrontPctT12 == null ? "missing-upfront-pct-t12" : null,
    deal.totalPctT12 == null ? "missing-total-pct-t12" : null,
    deal.producerTier ? null : "missing-producer-tier",
    deal.backendMetrics ? null : "missing-backend-metrics",
    deal.clawbackTerms ? null : "missing-clawback-terms",
  ];
}
