/**
 * Per-page Feed hydration. Builds a `FeedDb` instance for a single
 * page of `Article` rows.
 *
 * The five article→mention join tables are read with a full
 * `search({})` scan and filtered by the page's `articleId` set in
 * memory; the large entity tables (Advisor, EmploymentHistory, …) are
 * still hydrated through indexed primary-key / foreign-key lookups.
 *
 * Why the mention tables are scanned rather than queried by their
 * indexed `articleId` attribute: on the shared Fabric dev cluster, replicated
 * rows reliably reach the public-serving node (a full `search({})` sees
 * them) but their secondary indexes do NOT reliably replicate — an indexed
 * `search({conditions:[{attribute:"articleId",…}]})` against that node
 * silently returns zero rows even though the row is present. That made the
 * event-backed / recruiting / disclosure feed modes render empty for every
 * visitor (and broke the deploy smoke gate) after #771 swapped the feed off
 * `loadAll()`. The mention tables are tiny join tables (hundreds of rows);
 * the #721/#771 full-scan concern was the 13k-row Advisor / 90k-row
 * EmploymentHistory tables, which this module still avoids scanning. Do not
 * "optimize" these joins back to indexed `search({conditions})` lookups —
 * that reintroduces the dependency on Fabric secondary-index replication and
 * re-breaks the deploy. See `docs/fabric-runbook.md` §6.
 */
import type {
  AdvisorRow,
  ArticleAdvisorMentionRow,
  ArticleDisclosureMentionRow,
  ArticleFirmMentionRow,
  ArticleRow,
  ArticleTeamMentionRow,
  ArticleTransitionEventMentionRow,
  DisclosureRow,
  EmploymentHistoryRow,
  FirmRow,
  RecruitingDealQuoteRow,
  SanctionRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";
import type { FeedDb } from "./resource-feed-types.js";
import { allRows, rowsByAttribute } from "./resource-directory-tables.js";
import { rowsByIds } from "./resource-directory-search-queries.js";

const distinct = (
  values: readonly (string | undefined)[]
): readonly string[] => [
  ...new Set(values.filter((v): v is string => Boolean(v))),
];

const rowsByIndexed = async <T>(
  table: unknown,
  attribute: string,
  values: readonly string[]
): Promise<readonly T[]> => {
  if (values.length === 0) return [];
  const fetched = await Promise.all(
    values.map(value => rowsByAttribute<T>(table, attribute, value))
  );
  return fetched.flat();
};

/**
 * Loads firms that are referenced by hydrated advisor/team rows but were not
 * directly mentioned by the article join rows.
 * @param earlyFirms - Firms already loaded from explicit mentions/events.
 * @param employments - Employment rows for mentioned advisors.
 * @param teams - Team rows mentioned by articles or events.
 * @returns Additional firm rows needed for chip subtitles.
 */
async function loadExtraFirms(
  earlyFirms: readonly FirmRow[],
  employments: readonly EmploymentHistoryRow[],
  teams: readonly TeamRow[]
): Promise<readonly FirmRow[]> {
  const earlyFirmIdSet = new Set(earlyFirms.map(firm => firm.id));
  const extraFirmIds = distinct([
    ...employments.map(e => e.firmId),
    ...teams.map(t => t.currentFirmId),
  ]).filter(id => !earlyFirmIdSet.has(id));
  return await rowsByIds<FirmRow>(tables.Firm, extraFirmIds);
}

/** Shared shape of the five article→mention join rows: each carries an `articleId`. */
interface ArticleMentionRow {
  readonly articleId?: string;
}

/**
 * Reads a tiny article→mention join table in full and keeps only the rows
 * whose `articleId` is on the current page. Index-independent on purpose —
 * see the module header for why the `articleId` index is not trusted on the
 * Fabric serving node.
 * @param table - Harper mention-table handle from the ambient `tables` global.
 * @param articleIds - Set of article ids in the current feed page.
 * @returns Mention rows belonging to the page's articles.
 */
const mentionsForPage = async <T extends ArticleMentionRow>(
  table: unknown,
  articleIds: ReadonlySet<string>
): Promise<readonly T[]> => {
  const rows = await allRows<T>(table);
  return rows.filter(
    row => row.articleId !== undefined && articleIds.has(row.articleId)
  );
};

/**
 * Builds a `FeedDb` for the supplied page of articles. Every Harper
 * read in this function is either an indexed `search({conditions})` on
 * a foreign-key attribute or an indexed primary-key hydration; no
 * full-table reads.
 * @param articles - Page of Article rows to hydrate.
 * @returns A `FeedDb` slice scoped to those articles' mentioned
 *   entities, ready for `feedItem()` consumption.
 */
export async function loadFeedDbForArticles(
  articles: readonly ArticleRow[]
): Promise<FeedDb> {
  const articleIds = articles.map(article => article.id);
  if (articleIds.length === 0) return emptyFeedDb();
  try {
    const mentions = await loadArticleMentions(articleIds);
    const events = await loadEventRows(mentions);
    const entities = await loadMentionedEntities(mentions, events);
    return buildFeedDb({ ...mentions, ...events, ...entities });
  } catch (error) {
    // Surface the stage + article count so a failing /Feed page is
    // diagnosable from the request log without re-running with a
    // debugger attached.
    throw new Error(
      `feed: loadFeedDbForArticles failed while hydrating ${articleIds.length} article(s): ${String(error)}`,
      { cause: error }
    );
  }
}

/**
 *
 */
interface MentionTables {
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
  readonly mTE: readonly ArticleTransitionEventMentionRow[];
  readonly mDisc: readonly ArticleDisclosureMentionRow[];
}

const loadArticleMentions = async (
  articleIds: readonly string[]
): Promise<MentionTables> => {
  const wanted = new Set(articleIds);
  const [mAdv, mFirm, mTeam, mTE, mDisc] = await Promise.all([
    mentionsForPage<ArticleAdvisorMentionRow>(
      tables.ArticleAdvisorMention,
      wanted
    ),
    mentionsForPage<ArticleFirmMentionRow>(tables.ArticleFirmMention, wanted),
    mentionsForPage<ArticleTeamMentionRow>(tables.ArticleTeamMention, wanted),
    mentionsForPage<ArticleTransitionEventMentionRow>(
      tables.ArticleTransitionEventMention,
      wanted
    ),
    mentionsForPage<ArticleDisclosureMentionRow>(
      tables.ArticleDisclosureMention,
      wanted
    ),
  ]);
  return { mAdv, mFirm, mTeam, mTE, mDisc };
};

/**
 *
 */
interface EventRows {
  readonly transitions: readonly TransitionEventRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly deals: readonly RecruitingDealQuoteRow[];
}

const loadEventRows = async (mentions: MentionTables): Promise<EventRows> => {
  const transitionIds = distinct(
    mentions.mTE.map(mention => mention.transitionEventId)
  );
  const disclosureIds = distinct(
    mentions.mDisc.map(mention => mention.disclosureId)
  );
  const [transitions, disclosures] = await Promise.all([
    rowsByIds<TransitionEventRow>(tables.TransitionEvent, transitionIds),
    rowsByIds<DisclosureRow>(tables.Disclosure, disclosureIds),
  ]);
  const dealIds = distinct(transitions.map(t => t.recruitingDealId));
  const deals = await rowsByIds<RecruitingDealQuoteRow>(
    tables.RecruitingDealQuote,
    dealIds
  );
  return { transitions, disclosures, deals };
};

/**
 *
 */
interface MentionedEntities {
  readonly advisors: readonly AdvisorRow[];
  readonly firms: readonly FirmRow[];
  readonly teams: readonly TeamRow[];
  readonly employments: readonly EmploymentHistoryRow[];
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly sanctions: readonly SanctionRow[];
}

const loadMentionedEntities = async (
  mentions: MentionTables,
  events: EventRows
): Promise<MentionedEntities> => {
  const advisorIds = distinct([
    ...mentions.mAdv.map(m => m.advisorId),
    ...events.transitions.map(t => t.subjectAdvisorId),
    ...events.disclosures.map(d => d.advisorId),
  ]);
  const teamIds = distinct([
    ...mentions.mTeam.map(m => m.teamId),
    ...events.transitions.map(t => t.subjectTeamId),
  ]);
  const earlyFirmIds = distinct([
    ...mentions.mFirm.map(m => m.firmId),
    ...events.transitions.flatMap(t => [
      t.fromFirmId,
      t.toFirmId,
      t.subjectFirmId,
    ]),
  ]);
  const disclosureIds = events.disclosures.map(d => d.id);
  const [advisors, teams, earlyFirms, employments, teamSnaps, sanctions] =
    await Promise.all([
      rowsByIds<AdvisorRow>(tables.Advisor, advisorIds),
      rowsByIds<TeamRow>(tables.Team, teamIds),
      rowsByIds<FirmRow>(tables.Firm, earlyFirmIds),
      rowsByIndexed<EmploymentHistoryRow>(
        tables.EmploymentHistory,
        "advisorId",
        advisorIds
      ),
      rowsByIndexed<TeamMetricSnapshotRow>(
        tables.TeamMetricSnapshot,
        "teamId",
        teamIds
      ),
      rowsByIndexed<SanctionRow>(
        tables.Sanction,
        "disclosureId",
        disclosureIds
      ),
    ]);
  const extraFirms = await loadExtraFirms(earlyFirms, employments, teams);
  return {
    advisors,
    firms: [...earlyFirms, ...extraFirms],
    teams,
    employments,
    teamSnaps,
    sanctions,
  };
};

/**
 *
 */
interface BuildFeedDbInput {
  readonly advisors: readonly AdvisorRow[];
  readonly firms: readonly FirmRow[];
  readonly teams: readonly TeamRow[];
  readonly employments: readonly EmploymentHistoryRow[];
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly deals: readonly RecruitingDealQuoteRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly sanctions: readonly SanctionRow[];
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
  readonly mTE: readonly ArticleTransitionEventMentionRow[];
  readonly mDisc: readonly ArticleDisclosureMentionRow[];
}

const buildFeedDb = (input: BuildFeedDbInput): FeedDb => ({
  byAdvisor: new Map(input.advisors.map(advisor => [advisor.id, advisor])),
  byFirm: new Map(input.firms.map(firm => [firm.id, firm])),
  byTeam: new Map(input.teams.map(team => [team.id, team])),
  byTransition: new Map(input.transitions.map(t => [t.id, t])),
  byDeal: new Map(input.deals.map(deal => [deal.id, deal])),
  byDisclosure: new Map(input.disclosures.map(d => [d.id, d])),
  employments: input.employments,
  teamSnaps: input.teamSnaps,
  sanctions: input.sanctions,
  mAdv: input.mAdv,
  mFirm: input.mFirm,
  mTeam: input.mTeam,
  mTE: input.mTE,
  mDisc: input.mDisc,
});

const emptyFeedDb = (): FeedDb => ({
  byAdvisor: new Map(),
  byFirm: new Map(),
  byTeam: new Map(),
  byTransition: new Map(),
  byDeal: new Map(),
  byDisclosure: new Map(),
  employments: [],
  teamSnaps: [],
  sanctions: [],
  mAdv: [],
  mFirm: [],
  mTeam: [],
  mTE: [],
  mDisc: [],
});
