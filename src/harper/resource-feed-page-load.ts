/**
 * Per-page Feed hydration. Builds a `FeedDb` instance for a single
 * page of `Article` rows by issuing indexed mention lookups
 * (`articleId` carries `\@indexed` on all five mention tables) and indexed
 * primary-key hydrations for the entities those mentions touch.
 *
 * Replaces the previous `loadAll()` full-table scan in `/Feed` so a
 * deep page of the feed no longer materializes the 13k-row Advisor /
 * 90k-row EmploymentHistory tables. See
 * `.claude/scratch/issue-721-architecture.md` §5.3 for the design
 * rationale; per spike §0.1 Q1/Q2 the indexed lookups are btree
 * point/range scans.
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
import { rowsByAttribute } from "./resource-directory-tables.js";
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
  const mentions = await loadArticleMentions(articleIds);
  const events = await loadEventRows(mentions);
  const entities = await loadMentionedEntities(mentions, events);
  return buildFeedDb({ ...mentions, ...events, ...entities });
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
  const [mAdv, mFirm, mTeam, mTE, mDisc] = await Promise.all([
    rowsByIndexed<ArticleAdvisorMentionRow>(
      tables.ArticleAdvisorMention,
      "articleId",
      articleIds
    ),
    rowsByIndexed<ArticleFirmMentionRow>(
      tables.ArticleFirmMention,
      "articleId",
      articleIds
    ),
    rowsByIndexed<ArticleTeamMentionRow>(
      tables.ArticleTeamMention,
      "articleId",
      articleIds
    ),
    rowsByIndexed<ArticleTransitionEventMentionRow>(
      tables.ArticleTransitionEventMention,
      "articleId",
      articleIds
    ),
    rowsByIndexed<ArticleDisclosureMentionRow>(
      tables.ArticleDisclosureMention,
      "articleId",
      articleIds
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
  // Employments and team-currentFirmIds may reference firms the
  // mention pass missed (an advisor moved to a firm not separately
  // mentioned in the article). Fetch those extra firms by id so the
  // chip's firm subtitle resolves.
  const earlyFirmIdSet = new Set(earlyFirms.map(firm => firm.id));
  const extraFirmIds = distinct([
    ...employments.map(e => e.firmId),
    ...teams.map(t => t.currentFirmId),
  ]).filter(id => !earlyFirmIdSet.has(id));
  const extraFirms = await rowsByIds<FirmRow>(tables.Firm, extraFirmIds);
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
