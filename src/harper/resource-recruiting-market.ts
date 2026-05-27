/**
 * Public recruiting-market aggregation resource.
 *
 * Loads the public transition event corpus, filters it against the request
 * query params, and emits firm/market/move-level rollups plus an optional
 * per-firm watchlist payload. Aggregation helpers live in
 * `resource-recruiting-market-helpers.ts`; serialized shapes live in
 * `resource-recruiting-market-types.ts`.
 */

import type { RouteTarget } from "../types/harper-resource.js";
import type { ResourceIndex } from "./resource-data.js";
import type { WatchlistFilterItem } from "./resource-recruiting-watchlist.js";
import type {
  PublicRecruitingFilters,
  RecruitingDirection,
  RecruitingFilters,
  RecruitingMarketResponse,
} from "./resource-recruiting-market-types.js";

import { loadAll } from "./resource-data.js";
import * as watchlist from "./resource-recruiting-watchlist.js";
import {
  filteredMoves,
  firmMomentum,
  marketActivity,
  publicMove,
  recruitingMoves,
  summarizeMoves,
} from "./resource-recruiting-market-helpers.js";
import {
  boundedNumber,
  dateDesc,
  normalizeState,
  normalizeYear,
  readQuery,
  toWatchlistTarget,
} from "./resource-recruiting-market-utils.js";

/** Public recruiting market aggregation resource. */
export class RecruitingMarket extends Resource {
  /**
   * Allows anonymous readers to inspect public recruiting aggregates.
   * @returns True because recruiting market data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads firm, market, and move-level recruiting rollups.
   * @param target - Optional route target carrying year, firm, state,
   *   direction, and limit filters.
   * @returns Source-backed recruiting market payload.
   */
  async get(target?: RouteTarget): Promise<RecruitingMarketResponse> {
    const db = await loadAll();
    const filters = parseFilters(target, db);
    const generatedAt = new Date().toISOString();
    const moves = filteredMoves(recruitingMoves(db), filters);
    return {
      generatedAt,
      filters: publicFilters(filters),
      summary: summarizeMoves(moves),
      firmMomentum: firmMomentum(db, moves),
      watchlist: watchlist.watchlistPayload(db, moves, filters, generatedAt),
      marketActivity: marketActivity(moves),
      recentMoves: moves
        .slice()
        .sort(dateDesc("moveDate"))
        .slice(0, filters.limit)
        .map(publicMove),
      provenance: {
        sourceTables: [
          "TransitionEvent",
          "ArticleTransitionEventMention",
          "Article",
          "FirmAlias",
        ],
        sourceIds: moves.map(move => move.id),
      },
      emptyState:
        moves.length === 0
          ? "No matching public recruiting move data is loaded for these filters."
          : null,
    };
  }
}

/**
 * Parses recruiting market filters from the request target.
 * @param target - Optional route target carrying query params.
 * @param db - Loaded resource index used to resolve firm references.
 * @returns Parsed recruiting filters.
 */
function parseFilters(
  target: RouteTarget | undefined,
  db: ResourceIndex
): RecruitingFilters {
  const watchTarget = toWatchlistTarget(target);
  const watchItems = watchlist.watchlistFilters(watchTarget, db);
  const primaryWatchItem: WatchlistFilterItem | null =
    watchItems.length === 1 ? (watchItems[0] ?? null) : null;
  return {
    direction: parseDirection(readQuery(target, "direction")),
    firmId: primaryWatchItem?.firm?.id ?? null,
    firmQuery: primaryWatchItem?.query ?? null,
    limit: boundedNumber(readQuery(target, "limit"), 20, 1, 100),
    state: normalizeState(readQuery(target, "state")),
    watchItems,
    year: normalizeYear(readQuery(target, "year")),
  };
}

/**
 * Narrows the `direction` query value to the allowed union.
 * @param value - Raw query value pulled from the request target.
 * @returns A recognized direction, defaulting to `net` when unsupplied.
 */
function parseDirection(value: unknown): RecruitingDirection {
  if (value === "inbound" || value === "outbound" || value === "net") {
    return value;
  }
  return "net";
}

/**
 * Builds the public echo of request filters returned with each response.
 * @param filters - Parsed recruiting filters.
 * @returns Public recruiting filter payload.
 */
function publicFilters(filters: RecruitingFilters): PublicRecruitingFilters {
  return {
    direction: filters.direction,
    firmId: filters.firmId,
    firmQuery: filters.firmQuery,
    limit: filters.limit,
    state: filters.state,
    ...watchlist.publicWatchlistFilters(filters),
    year: filters.year,
  };
}
