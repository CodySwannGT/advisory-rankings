import type { RouteTarget } from "../types/harper-resource.js";

import { advisorProfilePayload } from "./resource-advisor.js";
import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import { loadAll } from "./resource-data.js";
import {
  feedEmptyState,
  feedSummary,
  matchesFeedCategory,
  matchesFeedMode,
  parseFeedFilters,
} from "./resource-feed-filters.js";
import { feedItem } from "./resource-feed.js";
import { firmAdvisorRows } from "./resource-firm.js";
import {
  cmpDesc,
  decodeCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import {
  normalizeId,
  resolveAdvisor,
  resolveArticle,
  resolveFirm,
  resolveTeam,
} from "./resource-routing.js";
import {
  fieldAssertionPayload,
  firmProfilePayload,
  readStatusParam,
  stripSortFields,
  teamProfilePayload,
} from "./resource-profile-endpoints-helpers.js";
import type {
  ArticleDetail,
  FeedItem,
  FeedResponse,
  FirmAdvisorsResponse,
  FirmProfileResponse,
  RouteError,
  TeamProfileResponse,
} from "./resource-profile-endpoints-types.js";

export type {
  ArticleBody,
  ArticleDetail,
  FeedItem,
  FeedResponse,
  FieldAssertionPayload,
  FirmAdvisorPublicRow,
  FirmAdvisorsResponse,
  FirmProfileBody,
  FirmProfileHeader,
  FirmProfileResponse,
  RouteError,
  TeamProfileBranch,
  TeamProfileResponse,
} from "./resource-profile-endpoints-types.js";

/**
 * Public article feed resource.
 */
export class Feed extends Resource {
  /**
   * Allows anonymous readers to load the public news feed.
   * @returns True because feed data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Hydrates the feed with article metadata, mentions, and event cards.
   * @param target - Request target carrying optional `mode` and `category`.
   * @returns Hydrated feed items ordered by publication date.
   */
  async get(target?: RouteTarget): Promise<FeedResponse> {
    const db = await loadAll();
    const items: readonly FeedItem[] = [...db.articles]
      .sort(cmpDesc("publishedDate"))
      .map(article => feedItem(article, db) as FeedItem);
    const filters = parseFeedFilters(target);
    const modeItems = items.filter(item => matchesFeedMode(item, filters.mode));
    const filteredItems = modeItems.filter(item =>
      matchesFeedCategory(item, filters.category)
    );
    return {
      generatedAt: new Date().toISOString(),
      count: filteredItems.length,
      filters,
      summary: feedSummary(items, modeItems, filteredItems, filters),
      emptyState: feedEmptyState(filteredItems, filters),
      items: filteredItems,
    };
  }
}

/** Single article detail resource. */
export class ArticleView extends Resource {
  /**
   * Allows anonymous readers to open article detail pages.
   * @returns True because article detail data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads one article with body, provenance, events, and entity chips.
   * @param target - Route target containing article id or slug.
   * @returns Article detail payload or a route error.
   */
  async get(target?: RouteTarget): Promise<ArticleDetail | RouteError> {
    const id = normalizeId(target);
    if (!id) return { error: "missing article id" };
    const db = await loadAll();
    const article = resolveArticle(db, id);
    if (!article) return { error: "not found", id };
    const fieldAssertions = db.fieldAssertions
      .filter(field => field.articleId === article.id)
      .map(fieldAssertionPayload);
    const base = feedItem(article, db) as FeedItem;
    return {
      ...base,
      body: { html: article.bodyHtml || null, text: article.bodyText || null },
      provenance: fieldAssertions,
    };
  }
}

/** Single firm profile resource. */
export class FirmProfile extends Resource {
  /**
   * Allows anonymous readers to inspect canonical firm profiles.
   * @returns True because firm profile data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads one firm profile without expanding large advisor rosters.
   * @param target - Route target containing firm id, slug, or alias.
   * @returns Firm profile payload or a route error.
   */
  async get(target?: RouteTarget): Promise<FirmProfileResponse | RouteError> {
    const id = normalizeId(target);
    if (!id) return { error: "missing firm id" };
    const db = await loadAll();
    const firm = resolveFirm(db, id);
    if (!firm) return { error: "not found", id };
    return firmProfilePayload(db, firm);
  }
}

/** Paginated firm advisor roster resource. */
export class FirmAdvisors extends Resource {
  /**
   * Allows anonymous readers to page through a firm's advisor roster.
   * @returns True because firm roster data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads current or past advisors for one firm.
   * @param target - Route target carrying firm id, status, cursor, and limit.
   * @returns Paginated advisor roster.
   */
  async get(target?: RouteTarget): Promise<FirmAdvisorsResponse | RouteError> {
    const id = normalizeId(target);
    if (!id) return { error: "missing firm id", items: [], nextCursor: null };
    const statusParam = readStatusParam(target);
    const status = statusParam === "past" ? "past" : "current";
    const { cursor, limit } = parsePagination(target);
    const db = await loadAll();
    const rows = firmAdvisorRows(db, id, status);
    const { items, nextCursor } = paginate(
      rows,
      { cursor: decodeCursor(cursor), limit },
      row => row._sortKey,
      row => row._id
    );
    return { items: items.map(stripSortFields), nextCursor };
  }
}

/** Single advisor profile resource. */
export class AdvisorProfile extends Resource {
  /**
   * Allows anonymous readers to inspect advisor profiles.
   * @returns True because advisor profile data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads one advisor profile with career, teams, compliance, and coverage.
   * @param target - Route target containing advisor id or slug.
   * @returns Advisor profile payload or a route error.
   */
  async get(target?: RouteTarget): Promise<AdvisorProfilePayload | RouteError> {
    const id = normalizeId(target);
    if (!id) return { error: "missing advisor id" };
    const db = await loadAll();
    const advisor = resolveAdvisor(db, id);
    return advisor
      ? advisorProfilePayload(db, advisor)
      : { error: "not found", id };
  }
}

/** Single team profile resource. */
export class TeamProfile extends Resource {
  /**
   * Allows anonymous readers to inspect team profiles.
   * @returns True because team profile data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads one team profile with members, metrics, transitions, and coverage.
   * @param target - Route target containing team id or slug.
   * @returns Team profile payload or a route error.
   */
  async get(target?: RouteTarget): Promise<TeamProfileResponse | RouteError> {
    const id = normalizeId(target);
    if (!id) return { error: "missing team id" };
    const db = await loadAll();
    const team = resolveTeam(db, id);
    return team ? teamProfilePayload(db, team) : { error: "not found", id };
  }
}
