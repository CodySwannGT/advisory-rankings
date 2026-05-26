/* eslint-disable jsdoc/require-jsdoc -- Private aggregation helpers are covered through the public endpoint. */
// @ts-nocheck
import { loadAll } from "./resource-data.js";
import { firmChip, transitionRow } from "./resource-feed.js";
import * as watchlist from "./resource-recruiting-watchlist.js";

/** Public recruiting market aggregation resource. */
export class RecruitingMarket extends Resource {
  /**
   * Allows anonymous readers to inspect public recruiting aggregates.
   * @returns True because recruiting market data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Loads firm, market, and move-level recruiting rollups.
   * @param target - Optional route target carrying year, firm, state, direction, and limit filters.
   * @returns Source-backed recruiting market payload.
   */
  async get(target) {
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

function parseFilters(target, db) {
  const watchItems = watchlist.watchlistFilters(target, db);
  const primaryWatchItem = watchItems.length === 1 ? watchItems[0] : null;
  const direction = ["inbound", "outbound", "net"].includes(
    target?.get?.("direction")
  )
    ? target.get("direction")
    : "net";
  return {
    direction,
    firmId: primaryWatchItem?.firm?.id ?? null,
    firmQuery: primaryWatchItem?.query ?? null,
    limit: boundedNumber(target?.get?.("limit"), 20, 1, 100),
    state: normalizeState(target?.get?.("state")),
    watchItems,
    year: normalizeYear(target?.get?.("year")),
  };
}

function recruitingMoves(db) {
  return db.transitions.map(transition => {
    const row = transitionRow(transition, db);
    const source = transitionSource(db, transition.id);
    const branch = transitionBranch(db, transition);
    return {
      ...row,
      id: transition.id,
      article: source.article,
      loadedAt: source.loadedAt,
      location: {
        city: branch?.city || null,
        state: branch?.state || null,
        label: [branch?.city, branch?.state].filter(Boolean).join(", ") || null,
      },
      sourceStatus: sourceStatus(row, source.article, branch),
      provenance: {
        sourceTable: "TransitionEvent",
        sourceIds: [transition.id],
        articleMentionIds: source.mentionIds,
      },
    };
  });
}

function transitionSource(db, transitionId) {
  const mentions = db.mTE.filter(
    mention => mention.transitionEventId === transitionId
  );
  const article = mentions
    .map(mention => db.byArticle.get(mention.articleId))
    .filter(Boolean)
    .sort(dateDesc("publishedDate"))[0];
  return {
    article: article
      ? {
          id: article.id,
          headline: article.headline,
          publishedDate: article.publishedDate || null,
          modifiedDate: article.modifiedDate || null,
          url: article.url || null,
        }
      : null,
    loadedAt: article?.modifiedDate || article?.publishedDate || null,
    mentionIds: mentions.map(mention => mention.id).filter(Boolean),
  };
}

function transitionBranch(db, transition) {
  return (
    (transition.toBranchId && db.byBranch.get(transition.toBranchId)) ||
    (transition.fromBranchId && db.byBranch.get(transition.fromBranchId)) ||
    null
  );
}

function filteredMoves(moves, filters) {
  const firmIds = watchlist.firmIdsForFilter(filters);
  return moves.filter(move => {
    if (filters.year && !String(move.moveDate || "").startsWith(filters.year))
      return false;
    if (filters.state && move.location.state !== filters.state) return false;
    if (firmIds.length === 0) return true;
    if (filters.direction === "inbound")
      return firmIds.includes(move.toFirm?.id);
    if (filters.direction === "outbound")
      return firmIds.includes(move.fromFirm?.id);
    return (
      firmIds.includes(move.toFirm?.id) || firmIds.includes(move.fromFirm?.id)
    );
  });
}

function firmMomentum(db, moves) {
  const byFirm = new Map();
  for (const move of moves) {
    addFirmMove(byFirm, move.toFirm, "inbound", move);
    addFirmMove(byFirm, move.fromFirm, "outbound", move);
  }
  return [...byFirm.values()]
    .map(row => ({
      ...row,
      netMoveCount: row.inbound.count - row.outbound.count,
      netKnownAum: row.inbound.knownAum - row.outbound.knownAum,
    }))
    .sort((left, right) => right.netKnownAum - left.netKnownAum)
    .map(row => ({
      ...row,
      firm: firmChip(db.byFirm.get(row.firm.id)) || row.firm,
    }));
}

function addFirmMove(byFirm, firm, direction, move) {
  if (!firm?.id) return;
  const row =
    byFirm.get(firm.id) ||
    byFirm
      .set(firm.id, {
        firm,
        inbound: emptySummary(),
        outbound: emptySummary(),
        sourceMoveIds: [],
      })
      .get(firm.id);
  row[direction] = addToSummary(row[direction], move);
  row.sourceMoveIds.push(move.id);
}

function marketActivity(moves) {
  const byMarket = new Map();
  for (const move of moves) {
    const key = move.location.label || "Unknown market";
    const row =
      byMarket.get(key) ||
      byMarket
        .set(key, {
          market: key,
          city: move.location.city,
          state: move.location.state,
          summary: emptySummary(),
          sourceMoveIds: [],
        })
        .get(key);
    row.summary = addToSummary(row.summary, move);
    row.sourceMoveIds.push(move.id);
  }
  return [...byMarket.values()].sort(
    (left, right) =>
      right.summary.knownAum - left.summary.knownAum ||
      right.summary.count - left.summary.count
  );
}

function summarizeMoves(moves) {
  return moves.reduce(addToSummary, emptySummary());
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

function publicMove(move) {
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

function sourceStatus(move, article, branch) {
  return [
    article ? "source-backed" : "missing-source",
    move?.subject ? null : "unresolved-entity",
    move?.aumMoved == null ? "missing-aum" : null,
    move?.productionT12 == null ? "missing-t12" : null,
    branch ? null : "missing-location",
  ].filter(Boolean);
}

function publicFilters(filters) {
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

function boundedNumber(value, fallback, min, max) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeState(value) {
  return value ? String(value).trim().toUpperCase() : null;
}

function normalizeYear(value) {
  return /^\d{4}$/.test(String(value || "")) ? String(value) : null;
}

function dateDesc(field) {
  return (left, right) =>
    String(right?.[field] || "").localeCompare(String(left?.[field] || ""));
}

/* eslint-enable jsdoc/require-jsdoc -- End local private-helper exception. */
