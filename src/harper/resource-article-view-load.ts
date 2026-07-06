/**
 * Per-request scoped loader for `/ArticleView/<id>`. Replaces the
 * request-wide `loadAll()` 34-table scan with reads keyed by the
 * subject article, following the same hydration plan as the `/Feed`
 * page loader (`resource-feed-page-load.ts`) but through
 * `buildScopedResourceIndex` so the firm-alias canonicalization the
 * legacy `loadAll()` path applied is preserved. The five
 * article→mention join tables and `FieldAssertion` are deliberately
 * scanned and filtered in memory — see `resource-profile-scoped-load.ts`
 * for the Fabric secondary-index replication rationale.
 */
import type {
  ArticleAdvisorMentionRow,
  ArticleDisclosureMentionRow,
  ArticleFirmMentionRow,
  ArticleRow,
  ArticleTeamMentionRow,
  ArticleTransitionEventMentionRow,
  DisclosureRow,
  EmploymentHistoryRow,
  FieldAssertionRow,
  FirmAliasRow,
  RecruitingDealQuoteRow,
  SanctionRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

import {
  buildScopedResourceIndex,
  type ResourceIndex,
  type ResourceTableRows,
} from "./resource-data.js";
import { optionalAll } from "./resource-directory-tables.js";
import { resolveArticle } from "./resource-routing.js";
import {
  advisorsByIdsBounded,
  distinctIds,
  firmsByIdsWithCanonical,
  rowsByAttributeAcross,
  rowsByIdsOptional,
  scanRowsWhere,
  subjectCandidates,
} from "./resource-profile-scoped-load.js";

/**
 * Loads the subject-scoped resource index for one article detail
 * request, shaped exactly like `loadAll()`'s output so `feedItem` and
 * the `resolveArticle` routing (id, slug, or headline) behave
 * identically.
 * @param identifier - Route id or slug for the article.
 * @returns Scoped `ResourceIndex` (no related rows when the article
 *   does not resolve, so the caller 404s consistently).
 */
export async function loadArticleViewIndex(
  identifier: string
): Promise<ResourceIndex> {
  const articles = await subjectCandidates<ArticleRow>(
    tables.Article,
    identifier
  );
  const article = resolveArticle(
    buildScopedResourceIndex({ articles }),
    identifier
  );
  if (!article) return buildScopedResourceIndex({ articles });
  const related = await loadArticleRelatedRows(article.id);
  return buildScopedResourceIndex({ articles, ...related });
}

/** Shared shape of the mention/provenance rows: each carries an `articleId`. */
interface ArticleScopedRow {
  readonly articleId?: string;
}

/** Mention and provenance rows scoped to the subject article. */
interface ArticleMentionRows {
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
  readonly mTE: readonly ArticleTransitionEventMentionRow[];
  readonly mDisc: readonly ArticleDisclosureMentionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
}

/** Event rows referenced by the article's mention rows. */
interface ArticleEventRows {
  readonly transitions: readonly TransitionEventRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly deals: readonly RecruitingDealQuoteRow[];
  readonly sanctions: readonly SanctionRow[];
}

/**
 * Fetches everything the article detail payload reads, in three waves:
 * mention/provenance scans, event hydration, then entity hydration.
 * @param articleId - Resolved subject article id.
 * @returns Scoped table rows for `buildScopedResourceIndex`.
 */
async function loadArticleRelatedRows(
  articleId: string
): Promise<Partial<ResourceTableRows>> {
  const mentions = await loadArticleMentionRows(articleId);
  const events = await loadArticleEventRows(mentions);
  const entities = await loadArticleEntityRows(mentions, events);
  return { ...mentions, ...events, ...entities };
}

/**
 * Reads the replication-affected mention and provenance tables with
 * bounded scans filtered to the subject article (see module header).
 * @param articleId - Resolved subject article id.
 * @returns Mention rows keyed like `ResourceTableRows`.
 */
async function loadArticleMentionRows(
  articleId: string
): Promise<ArticleMentionRows> {
  const forArticle = (row: ArticleScopedRow): boolean =>
    row.articleId === articleId;
  const [mAdv, mFirm, mTeam, mTE, mDisc, fieldAssertions] = await Promise.all([
    scanRowsWhere<ArticleAdvisorMentionRow>(
      tables.ArticleAdvisorMention,
      forArticle
    ),
    scanRowsWhere<ArticleFirmMentionRow>(tables.ArticleFirmMention, forArticle),
    scanRowsWhere<ArticleTeamMentionRow>(tables.ArticleTeamMention, forArticle),
    scanRowsWhere<ArticleTransitionEventMentionRow>(
      tables.ArticleTransitionEventMention,
      forArticle
    ),
    scanRowsWhere<ArticleDisclosureMentionRow>(
      tables.ArticleDisclosureMention,
      forArticle
    ),
    scanRowsWhere<FieldAssertionRow>(tables.FieldAssertion, forArticle),
  ]);
  return { mAdv, mFirm, mTeam, mTE, mDisc, fieldAssertions };
}

/**
 * Hydrates the event rows the article's mentions point at, plus the
 * deals and sanctions those events reference.
 * @param mentions - Mention rows scoped to the subject article.
 * @returns Event rows keyed like `ResourceTableRows`.
 */
async function loadArticleEventRows(
  mentions: ArticleMentionRows
): Promise<ArticleEventRows> {
  const [transitions, disclosures] = await Promise.all([
    rowsByIdsOptional<TransitionEventRow>(
      tables.TransitionEvent,
      distinctIds(mentions.mTE.map(row => row.transitionEventId))
    ),
    rowsByIdsOptional<DisclosureRow>(
      tables.Disclosure,
      distinctIds(mentions.mDisc.map(row => row.disclosureId))
    ),
  ]);
  const [deals, sanctions] = await Promise.all([
    rowsByIdsOptional<RecruitingDealQuoteRow>(
      tables.RecruitingDealQuote,
      distinctIds(transitions.map(row => row.recruitingDealId))
    ),
    rowsByAttributeAcross<SanctionRow>(
      tables.Sanction,
      "disclosureId",
      distinctIds(disclosures.map(row => row.id))
    ),
  ]);
  return { transitions, disclosures, deals, sanctions };
}

/**
 * Hydrates the advisors, teams, employments, snapshots, and firms the
 * article's mention and event rows reference.
 * @param mentions - Mention rows scoped to the subject article.
 * @param events - Hydrated event rows.
 * @returns Entity rows keyed like `ResourceTableRows`.
 */
async function loadArticleEntityRows(
  mentions: ArticleMentionRows,
  events: ArticleEventRows
): Promise<Partial<ResourceTableRows>> {
  const advisorIds = distinctIds([
    ...mentions.mAdv.map(row => row.advisorId),
    ...events.transitions.map(row => row.subjectAdvisorId),
    ...events.disclosures.map(row => row.advisorId),
  ]);
  const [advisors, teams, employments] = await Promise.all([
    advisorsByIdsBounded(advisorIds),
    rowsByIdsOptional<TeamRow>(
      tables.Team,
      distinctIds([
        ...mentions.mTeam.map(row => row.teamId),
        ...events.transitions.map(row => row.subjectTeamId),
      ])
    ),
    rowsByAttributeAcross<EmploymentHistoryRow>(
      tables.EmploymentHistory,
      "advisorId",
      advisorIds
    ),
  ]);
  const [teamSnaps, firms, firmAliases] = await Promise.all([
    rowsByAttributeAcross<TeamMetricSnapshotRow>(
      tables.TeamMetricSnapshot,
      "teamId",
      teams.map(team => team.id)
    ),
    firmsByIdsWithCanonical([
      ...mentions.mFirm.map(row => row.firmId),
      ...events.transitions.flatMap(row => [
        row.fromFirmId,
        row.toFirmId,
        row.subjectFirmId,
      ]),
      ...events.disclosures.map(row => row.firmIdAtTime),
      ...teams.map(team => team.currentFirmId),
      ...employments.map(row => row.firmId),
    ]),
    optionalAll<FirmAliasRow>(tables.FirmAlias),
  ]);
  return { advisors, teams, employments, teamSnaps, firms, firmAliases };
}
