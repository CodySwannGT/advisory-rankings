// @ts-nocheck
import { loadAll } from "./resource-data.js";
import {
  feedEmptyState,
  feedSummary,
  matchesFeedCategory,
  matchesFeedMode,
  parseFeedFilters,
} from "./resource-feed-filters.js";
import {
  articleStub,
  disclosureRow,
  feedItem,
  firmChip,
  teamChip,
  transitionRow,
} from "./resource-feed.js";
import { firmDueDiligenceModules } from "./resource-firm-due-diligence.js";
import { advisorCountsForFirm, firmAdvisorRows } from "./resource-firm.js";
import {
  cmpAsc,
  cmpDesc,
  decodeCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import { advisorProfilePayload } from "./resource-advisor.js";
import { teamMemberGroups } from "./resource-team.js";
import {
  normalizeId,
  resolveAdvisor,
  resolveArticle,
  resolveFirm,
  resolveTeam,
} from "./resource-routing.js";
/**
 * Public article feed resource.
 */
export class Feed extends Resource {
  /**
   * Allows anonymous readers to load the public news feed.
   * @returns True because feed data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Hydrates the feed with article metadata, mentions, and event cards.
   * @param target - Request target carrying optional `mode` and `category`.
   * @returns Hydrated feed items ordered by publication date.
   */
  async get(target) {
    const db = await loadAll();
    const items = [...db.articles]
      .sort(cmpDesc("publishedDate"))
      .map(article => feedItem(article, db));
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
  allowRead() {
    return true;
  }

  /**
   * Loads one article with body, provenance, events, and entity chips.
   * @param target - Route target containing article id or slug.
   * @returns Article detail payload or a route error.
   */
  async get(target) {
    const id = normalizeId(target);
    if (!id) return { error: "missing article id" };
    const db = await loadAll();
    const article = resolveArticle(db, id);
    if (!article) return { error: "not found", id };
    const fieldAssertions = db.fieldAssertions
      .filter(field => field.articleId === article.id)
      .map(fieldAssertionPayload);
    return {
      ...feedItem(article, db),
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
  allowRead() {
    return true;
  }

  /**
   * Loads one firm profile without expanding large advisor rosters.
   * @param target - Route target containing firm id, slug, or alias.
   * @returns Firm profile payload or a route error.
   */
  async get(target) {
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
  allowRead() {
    return true;
  }

  /**
   * Loads current or past advisors for one firm.
   * @param target - Route target carrying firm id, status, cursor, and limit.
   * @returns Paginated advisor roster.
   */
  async get(target) {
    const id = normalizeId(target);
    if (!id) return { error: "missing firm id", items: [], nextCursor: null };
    const status = target?.get?.("status") === "past" ? "past" : "current";
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
  allowRead() {
    return true;
  }

  /**
   * Loads one advisor profile with career, teams, compliance, and coverage.
   * @param target - Route target containing advisor id or slug.
   * @returns Advisor profile payload or a route error.
   */
  async get(target) {
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
  allowRead() {
    return true;
  }

  /**
   * Loads one team profile with members, metrics, transitions, and coverage.
   * @param target - Route target containing team id or slug.
   * @returns Team profile payload or a route error.
   */
  async get(target) {
    const id = normalizeId(target);
    if (!id) return { error: "missing team id" };
    const db = await loadAll();
    const team = resolveTeam(db, id);
    return team ? teamProfilePayload(db, team) : { error: "not found", id };
  }
}

/**
 * Keeps article provenance compact while preserving assertion confidence.
 * @param field - Field assertion row linked to an article.
 * @returns Public provenance payload for article detail pages.
 */
function fieldAssertionPayload(field) {
  return {
    targetTable: field.targetTable,
    targetId: field.targetId,
    fieldName: field.fieldName,
    assertedValue: field.assertedValue,
    quotePhrase: field.quotePhrase,
    confidence: field.confidence,
  };
}

/**
 * Builds the firm profile from canonical firm rows and all linked entities.
 * @param db - Preloaded tables and lookup maps.
 * @param firm - Canonical firm row resolved from id, slug, or alias.
 * @returns Firm profile payload used by the public web UI.
 */
function firmProfilePayload(db, firm) {
  const firmId = firm.id;
  const { currentAdvisorCount, pastAdvisorCount } = advisorCountsForFirm(
    db,
    firmId
  );
  const profile = {
    firm: { ...firm, short: firm.name },
    currentAdvisorCount,
    pastAdvisorCount,
    currentTeams: db.teams
      .filter(team => team.currentFirmId === firmId)
      .map(team => teamChip(team, db)),
    transitionsIn: db.transitions
      .filter(row => row.toFirmId === firmId)
      .sort(cmpDesc("moveDate"))
      .map(row => transitionRow(row, db)),
    transitionsOut: db.transitions
      .filter(row => row.fromFirmId === firmId)
      .sort(cmpDesc("moveDate"))
      .map(row => transitionRow(row, db)),
    branches: db.branches.filter(branch => branch.firmId === firmId),
    disclosuresAtThisFirm: db.disclosures
      .filter(row => row.firmIdAtTime === firmId)
      .map(row => disclosureRow(row, db)),
    articles: mentionedArticles(
      db,
      db.mFirm
        .filter(mention => mention.firmId === firmId)
        .map(mention => mention.articleId)
    ),
    brokerCheckSnapshot: firmBrokerCheckSnapshot(db, firmId),
  };
  return {
    ...profile,
    dueDiligence: firmDueDiligenceModules(db, firmId, profile),
  };
}

/**
 * Builds a team profile with current members, firm context, history, and coverage.
 * @param db - Preloaded tables and lookup maps.
 * @param team - Team row resolved from id or slug.
 * @returns Team profile payload used by the public web UI.
 */
function teamProfilePayload(db, team) {
  const teamId = team.id;
  const { currentMembers, pastMembers } = teamMemberGroups(db, teamId);
  const firm = team.currentFirmId ? db.byFirm.get(team.currentFirmId) : null;
  const branch = team.currentBranchId
    ? db.byBranch.get(team.currentBranchId)
    : null;
  return {
    team,
    currentFirm: firm && firmChip(firm),
    currentBranch: branch && {
      id: branch.id,
      name: branch.name,
      level: branch.level,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      buildingName: branch.buildingName,
    },
    currentMembers,
    pastMembers,
    metricSnapshots: db.teamSnaps
      .filter(snap => snap.teamId === teamId)
      .sort(cmpAsc("asOf")),
    transitions: db.transitions
      .filter(row => row.subjectTeamId === teamId)
      .map(row => transitionRow(row, db)),
    articles: mentionedArticles(
      db,
      db.mTeam
        .filter(mention => mention.teamId === teamId)
        .map(mention => mention.articleId)
    ),
  };
}

/**
 * Resolves article IDs from mention tables into newest-first profile coverage.
 * @param db - Preloaded article lookup map.
 * @param articleIds - Article IDs gathered from one or more mention tables.
 * @returns Compact article rows suitable for profile sidebars.
 */
function mentionedArticles(db, articleIds) {
  return [...new Set(articleIds)]
    .map(id => db.byArticle.get(id))
    .filter(Boolean)
    .sort(cmpDesc("publishedDate"))
    .map(articleStub);
}

/**
 * Exposes the latest firm BrokerCheck snapshot without raw scraper metadata.
 * @param db - Preloaded BrokerCheck snapshot indexes.
 * @param firmId - Canonical firm id used by profile resources.
 * @returns Public snapshot fields, or null when no snapshot exists.
 */
function firmBrokerCheckSnapshot(db, firmId) {
  const snap = db.bcSnapByFirm.get(firmId) || null;
  return (
    snap && {
      fetchedAt: snap.fetchedAt,
      id: snap.id,
      subjectCrd: snap.subjectCrd,
      bcScope: snap.bcScope,
      iaScope: snap.iaScope,
      disclosureCount: snap.disclosureCount,
      registeredStateCount: snap.registeredStateCount,
    }
  );
}

/**
 * Removes internal pagination fields before returning advisor roster rows.
 * @param row - Advisor roster row carrying private sort metadata.
 * @returns Roster row safe to expose through the resource response.
 */
function stripSortFields(row) {
  const { _sortKey, _id, ...publicRow } = row;
  return publicRow;
}
