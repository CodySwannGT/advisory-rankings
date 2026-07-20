import type { FirmRow } from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";
import type {
  WatchlistBranchCoverage,
  WatchlistEvidenceLinks,
} from "./resource-recruiting-watchlist-coverage.js";

import { firmChip } from "./resource-feed.js";
import {
  branchCoverage,
  evidenceLinks,
  unresolvedBranchCoverage,
} from "./resource-recruiting-watchlist-coverage.js";
import { normalizeId, resolveFirm } from "./resource-routing.js";

const MAX_WATCHLIST_ITEMS = 8;
const MISSING_LOCATION = "missing-location";
const MISSING_SOURCE = "missing-source";
const NO_MATCHING_MOVES = "no-matching-moves";
const UNRESOLVED_FIRM = "unresolved-firm";

/** Request target shape needed by watchlist query parsing. */
export interface WatchlistTarget {
  readonly get?: (name: string) => unknown;
  readonly getAll?: (name: string) => Iterable<unknown>;
}

/** Resolved firm filter used by recruiting watchlist aggregations. */
export interface WatchlistFilterItem {
  readonly query: string;
  readonly firm: FirmRow | null;
}

/** Recruiting market filters consumed by watchlist helpers. */
export interface WatchlistFilters {
  readonly firmId: string | null;
  readonly watchItems: ReadonlyArray<WatchlistFilterItem>;
}

/** Compact firm identity returned in watchlist rows. */
export interface WatchlistFirmChip {
  readonly id: string;
  readonly kind?: string;
  readonly name: string;
  readonly short?: string;
  readonly logoUrl?: string | null;
  readonly channel?: string;
  readonly hq?: string | null;
  readonly dissolvedYear?: number | null;
}

/** Move summary shared by inbound, outbound, and market totals. */
export interface WatchlistMoveSummary {
  readonly count: number;
  readonly knownAum: number;
  readonly unknownAumCount: number;
  readonly missingT12Count: number;
}

/** Source coverage counts for the moves behind a watchlist row. */
export interface WatchlistSourceCoverage {
  readonly moveCount: number;
  readonly sourceBackedCount: number;
  readonly missingSourceCount: number;
  readonly missingLocationCount: number;
}

/** Recruiting move shape needed by watchlist aggregation. */
export interface WatchlistMove {
  readonly id: string;
  readonly fromFirm?: WatchlistFirmChip | null;
  readonly toFirm?: WatchlistFirmChip | null;
  readonly aumMoved?: number | string | null;
  readonly productionT12?: number | string | null;
  readonly sourceStatus: ReadonlyArray<string>;
}

/** Public row for one watched firm query. */
export interface WatchlistItem {
  readonly query: string;
  readonly firm: WatchlistFirmChip | FirmRow | null;
  readonly inbound: WatchlistMoveSummary;
  readonly outbound: WatchlistMoveSummary;
  readonly netMoveCount: number;
  readonly netKnownAum: number;
  readonly sourceCoverage: WatchlistSourceCoverage;
  readonly branchCoverage: WatchlistBranchCoverage;
  readonly evidenceLinks: WatchlistEvidenceLinks;
  readonly sourceMoveIds: ReadonlyArray<string>;
  readonly sourceStatus: ReadonlyArray<string>;
}

/** Rollup summaries across every watched firm query. */
export interface WatchlistPayloadSummary {
  readonly inbound: WatchlistMoveSummary;
  readonly outbound: WatchlistMoveSummary;
  readonly netMoveCount: number;
  readonly netKnownAum: number;
}

/** Public watchlist payload returned by the recruiting market resource. */
export interface WatchlistPayload {
  readonly generatedAt: string;
  readonly count: number;
  readonly items: ReadonlyArray<WatchlistItem>;
  readonly summary: WatchlistPayloadSummary;
}

/** Public echo of query filters that belong to the watchlist feature. */
export interface PublicWatchlistFilters {
  readonly watchlistFirmIds: ReadonlyArray<string>;
  readonly watchlistFirmQueries: ReadonlyArray<string>;
}

/**
 * Resolves deduplicated firm watchlist filters from request query params.
 * @param target - Route target carrying `firm` or `firmId` query params.
 * @param db - Loaded resource index used to resolve firm identifiers.
 * @returns Up to the supported number of watchlist filter items.
 */
export function watchlistFilters(
  target: WatchlistTarget,
  db: ResourceIndex
): ReadonlyArray<WatchlistFilterItem> {
  return collectFirmFilters(target)
    .slice(0, MAX_WATCHLIST_ITEMS)
    .map(query => ({
      query,
      firm: resolveFirm(db, normalizeId(query)),
    }));
}

/**
 * Resolves firm IDs that should constrain move filtering.
 * @param filters - Parsed recruiting market filters.
 * @returns Firm IDs from watchlist items, or the primary firm ID fallback.
 */
export function firmIdsForFilter(
  filters: WatchlistFilters
): ReadonlyArray<string> {
  const watchlistIds = filters.watchItems
    .map(item => item.firm?.id)
    .filter((id): id is string => Boolean(id));
  if (watchlistIds.length > 0) return watchlistIds;
  return filters.firmId ? [filters.firmId] : [];
}

/**
 * Builds the full watchlist payload for recruiting market responses.
 * @param db - Loaded resource index used to render firm chips.
 * @param moves - Filtered recruiting moves.
 * @param filters - Parsed recruiting market filters.
 * @param generatedAt - Response generation timestamp.
 * @returns Watchlist payload, or null when no watchlist was requested.
 */
export function watchlistPayload(
  db: ResourceIndex,
  moves: ReadonlyArray<WatchlistMove>,
  filters: WatchlistFilters,
  generatedAt: string
): WatchlistPayload | null {
  if (filters.watchItems.length === 0) return null;
  const items = filters.watchItems.map(item =>
    watchlistItem(db, moves, item.query, item.firm)
  );
  return {
    generatedAt,
    count: items.length,
    items,
    summary: {
      inbound: summarizeWatchlistSide(items, "inbound"),
      outbound: summarizeWatchlistSide(items, "outbound"),
      netMoveCount: items.reduce((sum, item) => sum + item.netMoveCount, 0),
      netKnownAum: items.reduce((sum, item) => sum + item.netKnownAum, 0),
    },
  };
}

/**
 * Builds public filter echoes for watchlist query params.
 * @param filters - Parsed recruiting market filters.
 * @returns Public watchlist filter fields.
 */
export function publicWatchlistFilters(
  filters: WatchlistFilters
): PublicWatchlistFilters {
  return {
    watchlistFirmIds: filters.watchItems
      .map(item => item.firm?.id)
      .filter((id): id is string => Boolean(id)),
    watchlistFirmQueries: filters.watchItems.map(item => item.query),
  };
}

/**
 * Collects raw firm filter strings from supported query parameters.
 * @param target - Route target carrying query params.
 * @returns Non-empty firm filter strings.
 */
function collectFirmFilters(target: WatchlistTarget): ReadonlyArray<string> {
  return ["firm", "firmId"]
    .flatMap(name => targetValues(target, name))
    .flatMap(splitListValue)
    .map(value => value.trim())
    .filter(Boolean);
}

/**
 * Reads all values for one query parameter from the target.
 * @param target - Route target carrying query params.
 * @param name - Query parameter name.
 * @returns Stringified values in stable de-duplicated order.
 */
function targetValues(
  target: WatchlistTarget,
  name: string
): ReadonlyArray<string> {
  const fromGetAll =
    typeof target?.getAll === "function" ? [...target.getAll(name)] : [];
  if (fromGetAll.length > 0) return fromGetAll.map(String);
  const single = target?.get?.(name);
  const fromGet = single != null && single !== "" ? [single] : [];
  return fromGet.map(String);
}

/**
 * Splits comma-delimited query values into individual filter strings.
 * @param value - Raw query value.
 * @returns Trimmed non-empty list members.
 */
function splitListValue(value: string): ReadonlyArray<string> {
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Builds one watchlist item for a requested firm query.
 * @param db - Loaded resource index used to render firm chips.
 * @param moves - Filtered recruiting moves.
 * @param query - Original firm query string.
 * @param firm - Resolved firm row, if any.
 * @returns Public watchlist row with movement summaries.
 */
function watchlistItem(
  db: ResourceIndex,
  moves: ReadonlyArray<WatchlistMove>,
  query: string,
  firm: FirmRow | null
): WatchlistItem {
  if (!firm?.id) {
    return unresolvedWatchlistItem(query);
  }
  const inboundMoves = moves.filter(move => move.toFirm?.id === firm.id);
  const outboundMoves = moves.filter(move => move.fromFirm?.id === firm.id);
  const relatedMoves = [...inboundMoves, ...outboundMoves];
  const inbound = summarizeMoves(inboundMoves);
  const outbound = summarizeMoves(outboundMoves);
  return {
    query,
    firm:
      (firmChip(db.byFirm.get(firm.id)) as WatchlistFirmChip | null) || firm,
    inbound,
    outbound,
    netMoveCount: inbound.count - outbound.count,
    netKnownAum: inbound.knownAum - outbound.knownAum,
    sourceCoverage: sourceCoverage(relatedMoves),
    branchCoverage: branchCoverage(db, firm),
    evidenceLinks: evidenceLinks(query, firm),
    sourceMoveIds: relatedMoves.map(move => move.id),
    sourceStatus: watchlistSourceStatus(relatedMoves),
  };
}

/**
 * Builds the watchlist row for a firm query that could not be resolved.
 * @param query - Original firm query string.
 * @returns Unresolved public watchlist row.
 */
function unresolvedWatchlistItem(query: string): WatchlistItem {
  return {
    query,
    firm: null,
    inbound: emptySummary(),
    outbound: emptySummary(),
    netMoveCount: 0,
    netKnownAum: 0,
    sourceCoverage: emptyCoverage(),
    branchCoverage: unresolvedBranchCoverage(query),
    evidenceLinks: evidenceLinks(query, null),
    sourceMoveIds: [],
    sourceStatus: [UNRESOLVED_FIRM],
  };
}

/**
 * Summarizes AUM and missing-data counts for moves.
 * @param moves - Recruiting moves to aggregate.
 * @returns Move summary totals.
 */
function summarizeMoves(
  moves: ReadonlyArray<WatchlistMove>
): WatchlistMoveSummary {
  return moves.reduce(addToSummary, emptySummary());
}

/**
 * Sums inbound or outbound summaries across all watchlist items.
 * @param items - Watchlist rows to aggregate.
 * @param side - Summary side to read from each row.
 * @returns Side summary totals.
 */
function summarizeWatchlistSide(
  items: ReadonlyArray<WatchlistItem>,
  side: "inbound" | "outbound"
): WatchlistMoveSummary {
  return items.reduce(
    (summary, item) => ({
      count: summary.count + item[side].count,
      knownAum: summary.knownAum + item[side].knownAum,
      unknownAumCount: summary.unknownAumCount + item[side].unknownAumCount,
      missingT12Count: summary.missingT12Count + item[side].missingT12Count,
    }),
    emptySummary()
  );
}

/**
 * Builds an empty move summary accumulator.
 * @returns Zero-filled move summary.
 */
function emptySummary(): WatchlistMoveSummary {
  return { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 };
}

/**
 * Adds one move into a summary accumulator.
 * @param summary - Current accumulator.
 * @param move - Recruiting move to add.
 * @returns Updated summary.
 */
function addToSummary(
  summary: WatchlistMoveSummary,
  move: WatchlistMove
): WatchlistMoveSummary {
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
 * Counts source-backed and missing-source states for moves.
 * @param moves - Recruiting moves to inspect.
 * @returns Source coverage totals.
 */
function sourceCoverage(
  moves: ReadonlyArray<WatchlistMove>
): WatchlistSourceCoverage {
  return moves.reduce(
    (coverage, move) => ({
      moveCount: coverage.moveCount + 1,
      sourceBackedCount:
        coverage.sourceBackedCount +
        (move.sourceStatus.includes(MISSING_SOURCE) ? 0 : 1),
      missingSourceCount:
        coverage.missingSourceCount +
        (move.sourceStatus.includes(MISSING_SOURCE) ? 1 : 0),
      missingLocationCount:
        coverage.missingLocationCount +
        (move.sourceStatus.includes(MISSING_LOCATION) ? 1 : 0),
    }),
    emptyCoverage()
  );
}

/**
 * Builds an empty source coverage accumulator.
 * @returns Zero-filled source coverage.
 */
function emptyCoverage(): WatchlistSourceCoverage {
  return {
    moveCount: 0,
    sourceBackedCount: 0,
    missingSourceCount: 0,
    missingLocationCount: 0,
  };
}

/**
 * Resolves the sorted unique source statuses for a watchlist item.
 * @param moves - Recruiting moves behind the item.
 * @returns Source statuses, or a no-match sentinel when no moves exist.
 */
function watchlistSourceStatus(
  moves: ReadonlyArray<WatchlistMove>
): ReadonlyArray<string> {
  if (moves.length === 0) return [NO_MATCHING_MOVES];
  return [...new Set(moves.flatMap(move => move.sourceStatus))].sort(
    (left, right) => left.localeCompare(right)
  );
}
