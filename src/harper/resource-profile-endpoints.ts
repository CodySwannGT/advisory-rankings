import { readFile } from "node:fs/promises";

import type { RouteTarget } from "../types/harper-resource.js";

import {
  detailShellResponse,
  type ContentResponse,
} from "./detail-shell-negotiation.js";
import { advisorProfilePayload } from "./resource-advisor.js";
import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import { loadAll } from "./resource-data.js";
import {
  feedEmptyState,
  matchesFeedMode,
  parseFeedFilters,
} from "./resource-feed-filters.js";
import { feedItem } from "./resource-feed.js";
import { firmAdvisorRows } from "./resource-firm.js";
import {
  decodeCursor,
  decodeOffsetCursor,
  encodeOffsetCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import { feedArticlePage } from "./resource-directory-search-queries.js";
import { loadFeedDbForArticles } from "./resource-feed-page-load.js";
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
 * Reads a static detail shell from the deployed `web/` directory. The path
 * resolves relative to this compiled module, which Harper places at
 * `harper-app/` alongside the served `web/` assets. Shells are only served on
 * (rare) direct browser navigations to a legacy detail route, so an OS-cached
 * read per navigation is cheap and keeps this module free of mutable state.
 * @param shellFile - Shell HTML file name (e.g. `advisor.html`).
 * @returns The shell HTML contents.
 */
function readShellHtml(shellFile: string): Promise<string> {
  return readFile(new URL(`./web/${shellFile}`, import.meta.url), "utf8");
}

/**
 * Serves AdvisorBook's HTML app shell when a browser navigates straight to a
 * legacy detail data-route (so an invalid id renders the in-app not-found UI
 * instead of raw resource JSON). Returns `null` for the SPA's own JSON data
 * fetches and any non-document request, leaving the JSON payload untouched.
 * @param context - The resource's `getContext()` value (carries request headers).
 * @param resourceName - The detail resource class name.
 * @returns A `{ contentType, data }` shell response, or `null`.
 */
function maybeDetailShell(
  context: unknown,
  resourceName: string
): Promise<ContentResponse | null> {
  return detailShellResponse(context, resourceName, readShellHtml);
}

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
   *
   * Replaces the legacy full-table `loadAll()` scan with a paginated
   * `tables.Article.search({conditions, sort, limit, offset})` (spike
   * §0.1 Q1/Q2) plus per-page hydration of mention tables by indexed
   * `articleId`. See `.claude/scratch/issue-721-architecture.md` §5.3.
   *
   * Mode filtering (`event-backed`, `recruiting-moves`,
   * `compliance-disclosures`) stays in-process because it depends on
   * hydrated event cards — Harper conditions cannot express it (see
   * §5.3.3). For `mode !== "all"` the resource may return fewer than
   * `limit` items on a given page.
   *
   * `summary.total` is the matching-articles count for the active
   * category filter (NOT a global pre-filter total); top-level `hasMore`
   * is added so clients can render "more available" without computing
   * a global count.
   * @param target - Request target carrying optional `mode`, `category`,
   *   `cursor`, and `limit`.
   * @returns Hydrated feed items ordered by publication date.
   */
  async get(target?: RouteTarget): Promise<FeedResponse> {
    const filters = parseFeedFilters(target);
    const { cursor, limit } = parsePagination(target);
    const offset = decodeOffsetCursor(cursor);
    const { items: articles, total: categoryTotal } = await feedArticlePage(
      filters.category,
      limit,
      offset
    );
    const db = await loadFeedDbForArticles(articles);
    const pageItems: readonly FeedItem[] = articles.map(article =>
      feedItem(article, db)
    );
    const modeItems = pageItems.filter(item =>
      matchesFeedMode(item, filters.mode)
    );
    const filteredItems = modeItems;
    const hasMore = offset + articles.length < categoryTotal;
    const nextCursor = hasMore
      ? encodeOffsetCursor(offset + articles.length)
      : null;
    return {
      generatedAt: new Date().toISOString(),
      count: filteredItems.length,
      filters,
      summary: {
        returned: filteredItems.length,
        total: filteredItems.length,
        modeTotal: modeItems.length,
        categoryTotal,
      },
      emptyState: feedEmptyState(filteredItems, filters),
      items: filteredItems,
      nextCursor,
      hasMore,
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
   * @returns Article detail payload, a route error, or the HTML shell when a
   *   browser navigates directly to this route.
   */
  async get(
    target?: RouteTarget
  ): Promise<ArticleDetail | RouteError | ContentResponse> {
    const shell = await maybeDetailShell(this.getContext(), "ArticleView");
    if (shell) return shell;
    const id = normalizeId(target);
    if (!id) return { error: "missing article id" };
    const db = await loadAll();
    const article = resolveArticle(db, id);
    if (!article) return { error: "not found", id };
    const fieldAssertions = db.fieldAssertions
      .filter(field => field.articleId === article.id)
      .map(fieldAssertionPayload);
    const base = feedItem(article, db);
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
   * @returns Firm profile payload, a route error, or the HTML shell when a
   *   browser navigates directly to this route.
   */
  async get(
    target?: RouteTarget
  ): Promise<FirmProfileResponse | RouteError | ContentResponse> {
    const shell = await maybeDetailShell(this.getContext(), "FirmProfile");
    if (shell) return shell;
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
   * @returns Advisor profile payload, a route error, or the HTML shell when a
   *   browser navigates directly to this route.
   */
  async get(
    target?: RouteTarget
  ): Promise<AdvisorProfilePayload | RouteError | ContentResponse> {
    const shell = await maybeDetailShell(this.getContext(), "AdvisorProfile");
    if (shell) return shell;
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
   * @returns Team profile payload, a route error, or the HTML shell when a
   *   browser navigates directly to this route.
   */
  async get(
    target?: RouteTarget
  ): Promise<TeamProfileResponse | RouteError | ContentResponse> {
    const shell = await maybeDetailShell(this.getContext(), "TeamProfile");
    if (shell) return shell;
    const id = normalizeId(target);
    if (!id) return { error: "missing team id" };
    const db = await loadAll();
    const team = resolveTeam(db, id);
    return team ? teamProfilePayload(db, team) : { error: "not found", id };
  }
}
