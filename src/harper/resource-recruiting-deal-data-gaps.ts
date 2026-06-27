/**
 * Public recruiting deal-data gap resource.
 *
 * Derives its rows from the same public move aggregation as `RecruitingMarket`
 * and narrows the result to moves with missing public deal-data fields.
 */

import type { RouteTarget } from "../types/harper-resource.js";
import type { ResourceIndex } from "./resource-data.js";
import type { WatchlistFilterItem } from "./resource-recruiting-watchlist.js";
import type {
  MoveLocation,
  PublicMove,
  PublicRecruitingFilters,
  RecruitingDirection,
  RecruitingFilters,
  RecruitingMove,
} from "./resource-recruiting-market-types.js";

import { loadAll } from "./resource-data.js";
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  parsePagination,
} from "./resource-pagination.js";
import * as watchlist from "./resource-recruiting-watchlist.js";
import {
  filteredMoves,
  publicMove,
  recruitingMoves,
} from "./resource-recruiting-market-helpers.js";
import {
  dateDesc,
  normalizeState,
  normalizeYear,
  readQuery,
  toWatchlistTarget,
} from "./resource-recruiting-market-utils.js";

const SOURCE_BACKED = "source-backed";
const UNRESOLVED_ENTITY = "unresolved-entity";

const GAP_LABELS: Readonly<Record<string, string>> = {
  "missing-aum": "Missing AUM",
  "missing-backend-metrics": "Missing back-end metrics",
  "missing-clawback-terms": "Missing clawback terms",
  "missing-deal-terms": "Missing deal terms",
  "missing-location": "Missing market location",
  "missing-producer-tier": "Missing producer tier",
  "missing-source": "Missing source article",
  "missing-t12": "Missing T12 production",
  "missing-total-pct-t12": "Missing total deal percent",
  "missing-upfront-pct-t12": "Missing upfront deal percent",
  [UNRESOLVED_ENTITY]: "Unresolved advisor or team",
};

/** Visibility mode for unresolved advisor/team subjects. */
type UnresolvedVisibility = "include" | "exclude" | "only";

/** Internal filter set used while deriving deal-gap rows. */
interface DealGapFilters extends RecruitingFilters {
  readonly gapType: string | null;
  readonly unresolved: UnresolvedVisibility;
}

/** Public filter echo returned with the response. */
interface PublicDealGapFilters extends PublicRecruitingFilters {
  readonly gapType: string | null;
  readonly unresolved: UnresolvedVisibility;
}

/** Public links that help reviewers follow up on one gap row. */
export interface DealGapLinks {
  readonly article: string | null;
  readonly subject: string | null;
  readonly fromFirm: string | null;
  readonly toFirm: string | null;
  readonly recruitingMarket: string;
}

/** Public recruiting move decorated with missing-field metadata. */
export interface DealGapRow extends PublicMove {
  readonly market: MoveLocation;
  readonly missingFieldLabels: readonly string[];
  readonly gapTypes: readonly string[];
  readonly links: DealGapLinks;
}

/** Aggregate counts for the filtered deal-gap slice. */
export interface DealGapSummary {
  readonly count: number;
  readonly unresolvedCount: number;
  readonly sourceBackedCount: number;
}

/** Source tables and ids backing the response rows. */
export interface DealGapProvenance {
  readonly sourceTables: ReadonlyArray<
    | "TransitionEvent"
    | "RecruitingDealQuote"
    | "ArticleTransitionEventMention"
    | "Article"
    | "FirmAlias"
  >;
  readonly sourceIds: readonly string[];
}

/** Top-level response payload for `/RecruitingDealDataGaps`. */
export interface DealGapResponse {
  readonly generatedAt: string;
  readonly filters: PublicDealGapFilters;
  readonly summary: DealGapSummary;
  readonly items: readonly DealGapRow[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly provenance: DealGapProvenance;
  readonly emptyState: string | null;
}

/** Public data-gap endpoint for recruiting move follow-up. */
export class RecruitingDealDataGaps extends Resource {
  /**
   * Allows anonymous readers to inspect public recruiting data gaps.
   * @returns True because the rows are derived from public recruiting data.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads public move rows with missing deal-data fields.
   * @param target - Optional route target carrying filters and pagination.
   * @returns Cursor-paginated public gap rows.
   */
  async get(target?: RouteTarget): Promise<DealGapResponse> {
    const db = await loadAll();
    const filters = parseFilters(target, db);
    const gaps = gapRows(filteredMoves(recruitingMoves(db), filters), filters);
    const { cursor, limit } = parsePagination(target);
    const offset = decodeOffsetCursor(cursor);
    const items = gaps.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    const nextCursor =
      nextOffset < gaps.length ? encodeOffsetCursor(nextOffset) : null;
    return response(filters, limit, gaps, items, nextCursor);
  }
}

/**
 * Parses all supported filters from the Harper route target.
 * @param target - Optional request target carrying query params.
 * @param db - Loaded resource index used to resolve firm filters.
 * @returns Normalized internal filters.
 */
function parseFilters(
  target: RouteTarget | undefined,
  db: ResourceIndex
): DealGapFilters {
  const watchTarget = toWatchlistTarget(target);
  const watchItems = watchlist.watchlistFilters(watchTarget, db);
  const primaryWatchItem: WatchlistFilterItem | null =
    watchItems.length === 1 ? (watchItems[0] ?? null) : null;
  return {
    direction: parseDirection(readQuery(target, "direction")),
    firmId: primaryWatchItem?.firm?.id ?? null,
    firmQuery: primaryWatchItem?.query ?? null,
    gapType: parseGapType(readQuery(target, "gapType")),
    limit: 0,
    state: normalizeState(readQuery(target, "state")),
    unresolved: parseUnresolved(readQuery(target, "unresolved")),
    watchItems,
    year: normalizeYear(readQuery(target, "year")),
  };
}

/**
 * Parses the move direction filter.
 * @param value - Raw `direction` query value.
 * @returns A supported direction, defaulting to `net`.
 */
function parseDirection(value: unknown): RecruitingDirection {
  if (value === "inbound" || value === "outbound" || value === "net") {
    return value;
  }
  return "net";
}

/**
 * Parses a source-status gap token.
 * @param value - Raw `gapType` query value.
 * @returns The trimmed gap token, or null when absent.
 */
function parseGapType(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Parses unresolved-row visibility.
 * @param value - Raw `unresolved` query value.
 * @returns The requested visibility, defaulting to `include`.
 */
function parseUnresolved(value: unknown): UnresolvedVisibility {
  if (value === "only" || value === "exclude") return value;
  return "include";
}

/**
 * Builds sorted public gap rows from filtered recruiting moves.
 * @param moves - Recruiting moves after firm/state/year/direction filters.
 * @param filters - Deal-gap-specific filters.
 * @returns Newest-first gap rows.
 */
function gapRows(
  moves: readonly RecruitingMove[],
  filters: DealGapFilters
): readonly DealGapRow[] {
  return moves
    .filter(move => gapTypes(move).length > 0)
    .filter(move => matchesGapType(move, filters.gapType))
    .filter(move => matchesUnresolved(move, filters.unresolved))
    .slice()
    .sort(dateDesc("moveDate"))
    .map(toGapRow);
}

/**
 * Checks whether a move contains the requested gap type.
 * @param move - Candidate move.
 * @param gapType - Requested source-status token.
 * @returns True when no token is requested or the move contains it.
 */
function matchesGapType(move: RecruitingMove, gapType: string | null): boolean {
  return !gapType || gapTypes(move).includes(gapType);
}

/**
 * Applies unresolved-subject visibility rules.
 * @param move - Candidate move.
 * @param visibility - Requested unresolved visibility mode.
 * @returns True when the move is visible for the mode.
 */
function matchesUnresolved(
  move: RecruitingMove,
  visibility: UnresolvedVisibility
): boolean {
  const unresolved = gapTypes(move).includes(UNRESOLVED_ENTITY);
  if (visibility === "only") return unresolved;
  if (visibility === "exclude") return !unresolved;
  return true;
}

/**
 * Decorates a public recruiting move with gap metadata.
 * @param move - Internal recruiting move.
 * @returns Public gap row.
 */
function toGapRow(move: RecruitingMove): DealGapRow {
  const row = publicMove(move);
  const gaps = gapTypes(move);
  return {
    ...row,
    gapTypes: gaps,
    links: publicLinks(row),
    market: row.location,
    missingFieldLabels: gaps.map(labelForGap),
  };
}

/**
 * Extracts missing-field status tokens from a move.
 * @param move - Candidate move.
 * @returns Gap tokens excluding the positive `source-backed` marker.
 */
function gapTypes(move: RecruitingMove): readonly string[] {
  return move.sourceStatus.filter(status => status !== SOURCE_BACKED);
}

/**
 * Converts a gap token into readable copy.
 * @param status - Source-status token.
 * @returns Human-readable field label.
 */
function labelForGap(status: string): string {
  return GAP_LABELS[status] ?? status.replaceAll("-", " ");
}

/**
 * Builds public follow-up links for a gap row.
 * @param row - Public move payload.
 * @returns Public-safe article, subject, firm, and recruiting links.
 */
function publicLinks(row: PublicMove): DealGapLinks {
  return {
    article: row.article ? `/articles/${row.article.id}` : null,
    fromFirm: row.fromFirm ? `/firms/${row.fromFirm.id}` : null,
    recruitingMarket: "/recruiting",
    subject: row.subject ? `/${row.subject.kind}s/${row.subject.id}` : null,
    toFirm: row.toFirm ? `/firms/${row.toFirm.id}` : null,
  };
}

/**
 * Builds the top-level response envelope.
 * @param filters - Applied internal filters.
 * @param limit - Parsed page size echoed in the public filters.
 * @param gaps - Full filtered gap list.
 * @param items - Current page items.
 * @param nextCursor - Opaque cursor for the next page.
 * @returns Public response payload.
 */
function response(
  filters: DealGapFilters,
  limit: number,
  gaps: readonly DealGapRow[],
  items: readonly DealGapRow[],
  nextCursor: string | null
): DealGapResponse {
  return {
    emptyState:
      gaps.length === 0
        ? "No matching public recruiting deal-data gaps are loaded for these filters."
        : null,
    filters: publicFilters(filters, limit),
    generatedAt: new Date().toISOString(),
    items,
    nextCursor,
    provenance: {
      sourceTables: [
        "TransitionEvent",
        "RecruitingDealQuote",
        "ArticleTransitionEventMention",
        "Article",
        "FirmAlias",
      ],
      sourceIds: items.map(row => row.id),
    },
    summary: summarize(gaps),
    total: gaps.length,
  };
}

/**
 * Builds the public filter echo.
 * @param filters - Applied internal filters.
 * @param limit - Parsed page size.
 * @returns Public filter payload.
 */
function publicFilters(
  filters: DealGapFilters,
  limit: number
): PublicDealGapFilters {
  return {
    direction: filters.direction,
    firmId: filters.firmId,
    firmQuery: filters.firmQuery,
    gapType: filters.gapType,
    limit,
    state: filters.state,
    unresolved: filters.unresolved,
    ...watchlist.publicWatchlistFilters(filters),
    year: filters.year,
  };
}

/**
 * Summarizes the filtered gap rows.
 * @param rows - Filtered gap rows.
 * @returns Counts used by the UI and replay checks.
 */
function summarize(rows: readonly DealGapRow[]): DealGapSummary {
  return {
    count: rows.length,
    sourceBackedCount: rows.filter(row =>
      row.sourceStatus.includes(SOURCE_BACKED)
    ).length,
    unresolvedCount: rows.filter(row =>
      row.gapTypes.includes(UNRESOLVED_ENTITY)
    ).length,
  };
}
