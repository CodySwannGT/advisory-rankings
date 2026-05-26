/* eslint-disable jsdoc/require-jsdoc, functional/immutable-data -- Watchlist helpers build compact response rows in local maps. */
// @ts-nocheck
import { firmChip } from "./resource-feed.js";
import { normalizeId, resolveFirm } from "./resource-routing.js";

const MAX_WATCHLIST_ITEMS = 8;
const MISSING_LOCATION = "missing-location";
const MISSING_SOURCE = "missing-source";
const NO_MATCHING_MOVES = "no-matching-moves";
const UNRESOLVED_FIRM = "unresolved-firm";

export function watchlistFilters(target, db) {
  const seen = new Set();
  return collectFirmFilters(target)
    .map(query => {
      const firm = resolveFirm(db, normalizeId(query));
      const key = firm?.id || `query:${query.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { query, firm };
    })
    .filter(Boolean)
    .slice(0, MAX_WATCHLIST_ITEMS);
}

export function firmIdsForFilter(filters) {
  const watchlistIds = filters.watchItems
    .map(item => item.firm?.id)
    .filter(Boolean);
  if (watchlistIds.length > 0) return watchlistIds;
  return filters.firmId ? [filters.firmId] : [];
}

export function watchlistPayload(db, moves, filters, generatedAt) {
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

export function publicWatchlistFilters(filters) {
  return {
    watchlistFirmIds: filters.watchItems
      .map(item => item.firm?.id)
      .filter(Boolean),
    watchlistFirmQueries: filters.watchItems.map(item => item.query),
  };
}

function collectFirmFilters(target) {
  return ["firm", "firmId"]
    .flatMap(name => targetValues(target, name))
    .flatMap(splitListValue)
    .map(value => value.trim())
    .filter(Boolean);
}

function targetValues(target, name) {
  const values = [];
  if (typeof target?.getAll === "function") values.push(...target.getAll(name));
  const value = target?.get?.(name);
  if (value != null && value !== "") values.push(value);
  return [...new Set(values.map(String))];
}

function splitListValue(value) {
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function watchlistItem(db, moves, query, firm) {
  if (!firm?.id) {
    return {
      query,
      firm: null,
      inbound: emptySummary(),
      outbound: emptySummary(),
      netMoveCount: 0,
      netKnownAum: 0,
      sourceCoverage: emptyCoverage(),
      sourceMoveIds: [],
      sourceStatus: [UNRESOLVED_FIRM],
    };
  }
  const inboundMoves = moves.filter(move => move.toFirm?.id === firm.id);
  const outboundMoves = moves.filter(move => move.fromFirm?.id === firm.id);
  const relatedMoves = [...inboundMoves, ...outboundMoves];
  const inbound = summarizeMoves(inboundMoves);
  const outbound = summarizeMoves(outboundMoves);
  return {
    query,
    firm: firmChip(db.byFirm.get(firm.id)) || firm,
    inbound,
    outbound,
    netMoveCount: inbound.count - outbound.count,
    netKnownAum: inbound.knownAum - outbound.knownAum,
    sourceCoverage: sourceCoverage(relatedMoves),
    sourceMoveIds: relatedMoves.map(move => move.id),
    sourceStatus: watchlistSourceStatus(relatedMoves),
  };
}

function summarizeMoves(moves) {
  return moves.reduce(addToSummary, emptySummary());
}

function summarizeWatchlistSide(items, side) {
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

function emptySummary() {
  return { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 };
}

function addToSummary(summary, move) {
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

function sourceCoverage(moves) {
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

function emptyCoverage() {
  return {
    moveCount: 0,
    sourceBackedCount: 0,
    missingSourceCount: 0,
    missingLocationCount: 0,
  };
}

function watchlistSourceStatus(moves) {
  if (moves.length === 0) return [NO_MATCHING_MOVES];
  return [...new Set(moves.flatMap(move => move.sourceStatus))].sort(
    (left, right) => left.localeCompare(right)
  );
}

/* eslint-enable jsdoc/require-jsdoc, functional/immutable-data -- End local private-helper exception. */
