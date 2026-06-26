import type { RouteTarget } from "../types/harper-resource.js";
import type { ArticleRow, FieldAssertionRow } from "../types/harper-schema.js";

import { feedArticlePage } from "./resource-directory-search-queries.js";
import { loadFeedDbForArticles } from "./resource-feed-page-load.js";
import { feedItem } from "./resource-feed.js";
import type { FeedItem } from "./resource-feed-types.js";
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  parsePagination,
} from "./resource-pagination.js";
import {
  sourceArticleTriageReasons,
  type SourceArticleTriageReason,
  type SourceArticleTriageReasonPayload,
} from "./resource-source-article-triage-reasons.js";

/** Public row returned by `/SourceArticleTriage`. */
export interface SourceArticleTriageRow {
  readonly id: string;
  readonly headline: string | undefined;
  readonly publishedDate: ArticleRow["publishedDate"];
  readonly sourceUrl: string;
  readonly articleViewPath: string;
  readonly category: string | undefined;
  readonly advisorCount: number;
  readonly firmCount: number;
  readonly teamCount: number;
  readonly eventCardCount: number;
  readonly hasBody: boolean;
  readonly provenanceCount: number;
  readonly candidateProvenanceCount: number;
  readonly reasons: readonly SourceArticleTriageReasonPayload[];
  readonly reasonTokens: readonly SourceArticleTriageReason[];
}

/** Response returned by `/SourceArticleTriage`. */
export interface SourceArticleTriageResponse {
  readonly generatedAt: string;
  readonly count: number;
  readonly filters: SourceArticleTriageFilterEcho;
  readonly items: readonly SourceArticleTriageRow[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** Normalized filters echoed by `/SourceArticleTriage`. */
export interface SourceArticleTriageFilterEcho {
  readonly category: string;
  readonly reason: SourceArticleTriageReason | null;
  readonly limit: number;
}

/** Public source-article extraction-gap queue. */
export class SourceArticleTriage extends Resource {
  /**
   * Allows anonymous readers to inspect public source-article triage rows.
   * @returns True because all fields derive from public article resources.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads public articles with observable extraction gaps.
   * @param target - Request target carrying `category`, `reason`, `cursor`,
   *   and `limit`.
   * @returns Bounded triage rows and an opaque cursor for the next raw page.
   */
  async get(target?: RouteTarget): Promise<SourceArticleTriageResponse> {
    const filters = parseSourceArticleTriageFilters(target);
    const { cursor, limit } = parsePagination(target);
    const offset = decodeOffsetCursor(cursor);
    const page = await loadTriagePage(filters, limit, offset);
    return {
      generatedAt: new Date().toISOString(),
      count: page.items.length,
      filters: { ...filters, limit },
      items: page.items,
      nextCursor: page.hasMore ? encodeOffsetCursor(page.nextOffset) : null,
      hasMore: page.hasMore,
    };
  }
}

/** Normalized filters accepted by `/SourceArticleTriage`. */
interface SourceArticleTriageFilters {
  readonly category: string;
  readonly reason: SourceArticleTriageReason | null;
}

/** Internal page state after scanning raw Article pages. */
interface LoadedSourceArticleTriagePage {
  readonly items: readonly SourceArticleTriageRow[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
}

/** Raw Article row paired with the shared public Feed card payload. */
interface TriageArticlePair {
  readonly article: ArticleRow;
  readonly item: FeedItem;
}

/** Minimal route-target shape used for triage filters. */
interface SourceArticleTriageTarget {
  readonly get?: (name: string) => unknown;
}

const SOURCE_ARTICLE_TRIAGE_REASONS = new Set<SourceArticleTriageReason>([
  "uncategorized",
  "no-event-cards",
  "no-entity-chips",
  "no-body-text",
  "missing-provenance",
  "candidate-only-provenance",
]);

/**
 * Reads category and reason filters from the request target.
 * @param target - Route target or request target.
 * @returns Normalized source triage filters.
 */
function parseSourceArticleTriageFilters(
  target: RouteTarget | null | undefined
): SourceArticleTriageFilters {
  const t = target as SourceArticleTriageTarget | null | undefined;
  const getter = typeof t?.get === "function" ? t.get.bind(t) : null;
  const categoryValue = getter?.("category");
  const reasonValue = getter?.("reason");
  return {
    category: normalizeCategory(categoryValue),
    reason: normalizeReason(reasonValue),
  };
}

/**
 * Scans article pages until a full triage page is collected or exhausted.
 * @param filters - Normalized resource filters.
 * @param limit - Maximum rows to return.
 * @param offset - Raw Article search offset.
 * @returns Matching triage rows and next raw offset.
 */
async function loadTriagePage(
  filters: SourceArticleTriageFilters,
  limit: number,
  offset: number
): Promise<LoadedSourceArticleTriagePage> {
  const articlePage = await feedArticlePage(filters.category, limit, offset);
  const pairs = await hydrateArticlePairs(articlePage.items);
  const assertions = await fieldAssertionsForArticles(articlePage.items);
  const matches = pairs
    .map(pair => triageRow(pair, assertions))
    .filter(row => matchesReason(row, filters.reason));
  const nextOffset = offset + articlePage.items.length;
  if (
    matches.length >= limit ||
    nextOffset >= articlePage.total ||
    articlePage.items.length === 0
  ) {
    return {
      items: matches.slice(0, limit),
      nextOffset,
      hasMore: nextOffset < articlePage.total,
    };
  }
  const next = await loadTriagePage(
    filters,
    limit - matches.length,
    nextOffset
  );
  return {
    items: [...matches, ...next.items],
    nextOffset: next.nextOffset,
    hasMore: next.hasMore,
  };
}

/**
 * Hydrates Article rows with Feed cards for shared public event/entity counts.
 * @param articles - Raw Article rows.
 * @returns Article and Feed payload pairs in article order.
 */
async function hydrateArticlePairs(
  articles: readonly ArticleRow[]
): Promise<readonly TriageArticlePair[]> {
  const db = await loadFeedDbForArticles(articles);
  return articles.map(article => ({ article, item: feedItem(article, db) }));
}

/**
 * Reads public provenance rows for the supplied articles.
 * @param articles - Article rows in the current raw page.
 * @returns Field assertion rows grouped by article id.
 */
async function fieldAssertionsForArticles(
  articles: readonly ArticleRow[]
): Promise<ReadonlyMap<string, readonly FieldAssertionRow[]>> {
  const articleIds = new Set(articles.map(article => article.id));
  if (articleIds.size === 0) return new Map();
  const rows = await Array.fromAsync(
    (tables.FieldAssertion as unknown as FieldAssertionTable).search({})
  );
  return rows
    .filter(row => articleIds.has(row.articleId))
    .reduce<
      ReadonlyMap<string, readonly FieldAssertionRow[]>
    >((grouped, row) => new Map([...grouped, [row.articleId, [...(grouped.get(row.articleId) ?? []), row]]]), new Map());
}

/**
 * Converts one hydrated article into the public source-triage row shape.
 * @param pair - Article row and corresponding Feed payload.
 * @param assertionsByArticle - Field assertions grouped by article id.
 * @returns Public triage row.
 */
function triageRow(
  pair: TriageArticlePair,
  assertionsByArticle: ReadonlyMap<string, readonly FieldAssertionRow[]>
): SourceArticleTriageRow {
  const { article, item } = pair;
  const summary = sourceArticleTriageReasons({
    article,
    eventCardCount: item.eventCards.length,
    advisorCount: item.advisors.length,
    firmCount: item.firms.length,
    teamCount: item.teams.length,
    provenanceRows: assertionsByArticle.get(article.id) ?? [],
  });
  return {
    id: article.id,
    headline: article.headline,
    publishedDate: article.publishedDate,
    sourceUrl: article.url,
    articleViewPath: `/articles/${encodeURIComponent(article.slug ?? article.id)}`,
    category: article.category,
    advisorCount: item.advisors.length,
    firmCount: item.firms.length,
    teamCount: item.teams.length,
    eventCardCount: item.eventCards.length,
    hasBody: summary.hasBody,
    provenanceCount: summary.provenanceCount,
    candidateProvenanceCount: summary.candidateProvenanceCount,
    reasons: summary.reasons,
    reasonTokens: summary.reasonTokens,
  };
}

/**
 * Tests a triage row against the optional reason filter.
 * @param row - Source triage row.
 * @param reason - Reason token filter, or null for all gaps.
 * @returns True when the row has gaps and matches the requested reason.
 */
function matchesReason(
  row: SourceArticleTriageRow,
  reason: SourceArticleTriageReason | null
): boolean {
  if (row.reasonTokens.length === 0) return false;
  return reason === null || row.reasonTokens.includes(reason);
}

/**
 * Normalizes source category query values for the shared feed Article search.
 * @param value - Raw query value.
 * @returns Category filter, defaulting to all.
 */
function normalizeCategory(value: unknown): string {
  const category = String(value ?? "").trim();
  return category.length > 0 ? category : "all";
}

/**
 * Narrows a query value to a supported triage reason token.
 * @param value - Raw reason query value.
 * @returns Supported reason token, or null for the unfiltered queue.
 */
function normalizeReason(value: unknown): SourceArticleTriageReason | null {
  const reason = String(value ?? "").trim();
  return SOURCE_ARTICLE_TRIAGE_REASONS.has(reason as SourceArticleTriageReason)
    ? (reason as SourceArticleTriageReason)
    : null;
}

/** Minimal Harper table search surface for FieldAssertion reads. */
interface FieldAssertionTable {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<FieldAssertionRow>;
}
