/* eslint-disable jsdoc/require-jsdoc -- Private aggregation helpers build compact response objects in local maps. */
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

export function recruitingMoves(db: ResourceIndex): readonly RecruitingMove[] {
  return db.transitions.flatMap((transition): readonly RecruitingMove[] => {
    const row = transitionRow(transition, db);
    if (!row) return [];
    return [buildRecruitingMove(db, transition, row)];
  });
}

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
    },
  };
}

function buildMoveLocation(branch: BranchRow | null): MoveLocation {
  return {
    city: branch?.city ?? null,
    state: branch?.state ?? null,
    label:
      [branch?.city, branch?.state].filter(isNonEmptyString).join(", ") || null,
  };
}

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

function toMoveArticle(article: ArticleRow): MoveArticle {
  return {
    id: article.id,
    headline: article.headline,
    publishedDate: toIsoOrNull(article.publishedDate),
    modifiedDate: toIsoOrNull(article.modifiedDate),
    url: article.url ?? null,
  };
}

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

export function filteredMoves(
  moves: readonly RecruitingMove[],
  filters: RecruitingFilters
): readonly RecruitingMove[] {
  const firmIds = watchlist.firmIdsForFilter(filters);
  return moves.filter(move => matchesFilters(move, filters, firmIds));
}

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

function matchesYear(move: RecruitingMove, year: string | null): boolean {
  if (!year) return true;
  return String(move.moveDate ?? "").startsWith(year);
}

function matchesState(move: RecruitingMove, state: string | null): boolean {
  if (!state) return true;
  return move.location.state === state;
}

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

function toFirmMomentumRow(row: FirmMomentumAccumulator): FirmMomentumRow {
  return {
    ...row,
    netMoveCount: row.inbound.count - row.outbound.count,
    netKnownAum: row.inbound.knownAum - row.outbound.knownAum,
  };
}

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

export function summarizeMoves(moves: readonly RecruitingMove[]): MoveSummary {
  return moves.reduce(addToSummary, emptySummary());
}

export function emptySummary(): MoveSummary {
  return { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 };
}

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
    location: move.location,
    article: move.article,
    loadedAt: move.loadedAt,
    sourceStatus: move.sourceStatus,
    provenance: move.provenance,
  };
}

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
    branch ? null : "missing-location",
  ].filter(isNonEmptyString);
}

/* eslint-enable jsdoc/require-jsdoc -- End local private-helper exception. */
