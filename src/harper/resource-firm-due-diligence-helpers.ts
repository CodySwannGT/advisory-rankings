import type { RankingEntryRow } from "../types/harper-schema.js";
import type {
  CoverageTimelineModule,
  DataConfidenceModule,
  DataConfidenceModuleEntry,
  DueDiligenceModules,
  FirmArticleStubView,
  FirmBrokerCheckSnapshotSlice,
  FirmDueDiligenceDb,
  FirmDueDiligenceProfile,
  FirmTransitionRowView,
  RankingAppearance,
  RankingPresenceModule,
  RecentTransitionMove,
  RecruitingMomentumModule,
  RegulatorySnapshotModule,
  RosterFootprintModule,
  TransitionsSummary,
} from "./resource-firm-due-diligence-types.js";
import {
  brokerCheckSource,
  dateDesc,
  freshnessNote,
  latestDate,
  latestRankingYear,
  transitionFirmId,
} from "./resource-firm-due-diligence-utils.js";

/**
 * Builds the recruiting-momentum due-diligence module from the firm's inbound and outbound
 * transitions, computing net counts/AUM and surfacing the five most recent moves.
 * @param firmId The firm id under review; used to label each recent move as inbound or outbound.
 * @param transitionsIn Transitions where the firm is the destination.
 * @param transitionsOut Transitions where the firm is the origin.
 * @returns The fully populated recruiting-momentum module.
 */
export function recruitingMomentumModule(
  firmId: string,
  transitionsIn: readonly FirmTransitionRowView[] = [],
  transitionsOut: readonly FirmTransitionRowView[] = []
): RecruitingMomentumModule {
  const inbound = summarizeTransitions(transitionsIn);
  const outbound = summarizeTransitions(transitionsOut);
  const hasData = transitionsIn.length + transitionsOut.length > 0;
  const all = [...transitionsIn, ...transitionsOut];
  return {
    status: hasData ? "loaded" : "not_found",
    note: hasData
      ? "Calculated from canonical TransitionEvent rows for this firm."
      : "No transition rows are loaded for this firm.",
    inbound,
    outbound,
    netMoveCount: inbound.count - outbound.count,
    netAumMoved: inbound.knownAum - outbound.knownAum,
    recentMoves: recentTransitionMoves(all, firmId),
    provenance: {
      sourceTable: "TransitionEvent",
      sourceIds: all.map(row => row.id),
    },
    freshness: freshnessNote(
      latestDate(all, "moveDate"),
      "No transition move date is loaded for this firm."
    ),
  };
}

/**
 * Selects the latest transition moves and labels direction relative to a firm.
 * @param rows - Candidate transition rows.
 * @param firmId - Firm id used to classify inbound and outbound moves.
 * @returns Recent transition movement summaries.
 */
function recentTransitionMoves(
  rows: readonly FirmTransitionRowView[],
  firmId: string
): readonly RecentTransitionMove[] {
  return rows
    .slice()
    .sort(dateDesc("moveDate"))
    .slice(0, 5)
    .map(move => ({
      id: move.id,
      direction:
        transitionFirmId(move.toFirm) === firmId ? "inbound" : "outbound",
      subject: move.subject,
      fromFirm: move.fromFirm,
      toFirm: move.toFirm,
      moveDate: move.moveDate ?? null,
      aumMoved: move.aumMoved ?? null,
    }));
}

/**
 * Reduces a transition list into total/known-AUM/unknown-AUM counters, treating non-finite AUM as unknown.
 * @param rows Transition rows for one direction.
 * @returns Summary used by the recruiting-momentum module.
 */
function summarizeTransitions(
  rows: readonly FirmTransitionRowView[]
): TransitionsSummary {
  return rows.reduce<TransitionsSummary>(
    (summary, row) => {
      const hasKnownAum = row.aumMoved != null && row.aumMoved !== "";
      const aum = hasKnownAum ? Number(row.aumMoved) : NaN;
      return {
        count: summary.count + 1,
        knownAum: summary.knownAum + (Number.isFinite(aum) ? aum : 0),
        unknownAumCount:
          summary.unknownAumCount + (Number.isFinite(aum) ? 0 : 1),
      };
    },
    { count: 0, knownAum: 0, unknownAumCount: 0 }
  );
}

/**
 * Assembles the roster-footprint module by reading the canonical advisor, team, and branch counts off
 * the profile, deriving status from whether any rows are present.
 * @param profile Hydrated firm profile.
 * @returns The roster-footprint module.
 */
export function rosterFootprintModule(
  profile: FirmDueDiligenceProfile
): RosterFootprintModule {
  const branchCount = profile.branches.length;
  const teamCount = profile.currentTeams.length;
  const advisorCount =
    profile.currentAdvisorCount +
    profile.pastAdvisorCount +
    teamCount +
    branchCount;
  return {
    status: advisorCount > 0 ? "loaded" : "not_found",
    note:
      advisorCount > 0
        ? "Counts are derived from canonical roster, team, and branch rows."
        : "No roster, team, or branch rows are loaded for this firm.",
    currentAdvisorCount: profile.currentAdvisorCount,
    pastAdvisorCount: profile.pastAdvisorCount,
    teamCount,
    branchCount,
    freshness: freshnessNote(
      profile.brokerCheckSnapshot?.fetchedAt ?? null,
      "Roster freshness date is unavailable; BrokerCheck fetched date is the closest loaded source timestamp."
    ),
    provenance: {
      sourceTables: ["EmploymentHistory", "Team", "Branch"],
    },
  };
}

/**
 * Builds the ranking-presence module from a firm's RankingEntry rows, returning a `not_found`-style
 * payload when no rows are loaded and computing top rank/resolved counts when they are.
 * @param db Firm due-diligence database providing ranking lookups.
 * @param rows RankingEntry rows linked to this firm.
 * @returns The ranking-presence module.
 */
export function rankingPresenceModule(
  db: FirmDueDiligenceDb,
  rows: readonly RankingEntryRow[]
): RankingPresenceModule {
  if (!rows.length)
    return {
      status: "unavailable",
      note: "No RankingEntry rows are loaded for this firm; this does not imply the firm has no ranked advisors, teams, or firm appearances.",
      appearances: [],
      resolvedCount: 0,
      unresolvedCount: 0,
      provenance: { sourceTable: "RankingEntry", sourceIds: [] },
      freshness: freshnessNote(
        null,
        "Ranking freshness is unavailable because no RankingEntry rows are loaded."
      ),
    };
  const appearances = rows.map(row => rankingAppearance(db, row));
  const sortedFiniteRanks = appearances
    .map(row => row.rank)
    .filter((rank): rank is number => rank != null && Number.isFinite(rank))
    .slice()
    .sort((a, b) => a - b);
  return {
    status: "loaded",
    note: "Ranking appearances are grouped from loaded RankingEntry rows.",
    appearances,
    resolvedCount: appearances.filter(row => row.ranking).length,
    unresolvedCount: appearances.filter(row => !row.ranking).length,
    topRank: sortedFiniteRanks[0] ?? null,
    provenance: {
      sourceTable: "RankingEntry",
      sourceIds: rows.map(row => row.id),
    },
    freshness: freshnessNote(
      latestRankingYear(appearances),
      "Ranking freshness is unavailable because ranking years are missing."
    ),
  };
}

/**
 * Collects every RankingEntry row that ties to the firm directly, via one of its advisors, or via
 * one of its current teams.
 * @param db Firm due-diligence database.
 * @param firmId Firm id under review.
 * @returns Matching ranking rows.
 */
export function rankingRows(
  db: FirmDueDiligenceDb,
  firmId: string
): readonly RankingEntryRow[] {
  const firmAdvisorIds = new Set(
    db.employments
      .filter(row => row.firmId === firmId)
      .map(row => row.advisorId)
      .filter((id): id is string => Boolean(id))
  );
  const firmTeamIds = new Set(
    db.teams
      .filter(row => row.currentFirmId === firmId)
      .map(row => row.id)
      .filter((id): id is string => Boolean(id))
  );
  return db.rankingEntries.filter(
    row =>
      row.subjectFirmId === firmId ||
      (row.subjectAdvisorId != null &&
        firmAdvisorIds.has(row.subjectAdvisorId)) ||
      (row.subjectTeamId != null && firmTeamIds.has(row.subjectTeamId))
  );
}

/**
 * Hydrates one RankingEntry row into a RankingAppearance, joining the ranking lookup when available.
 * @param db Firm due-diligence database providing ranking lookups.
 * @param row RankingEntry row.
 * @returns The compact appearance view.
 */
function rankingAppearance(
  db: FirmDueDiligenceDb,
  row: RankingEntryRow
): RankingAppearance {
  const ranking = db.byRanking.get(row.rankingId) ?? null;
  return {
    id: row.id,
    subjectType: ranking?.subjectType || inferredRankingSubject(row),
    ranking: ranking
      ? {
          id: ranking.id,
          publisher: ranking.publisher,
          name: ranking.name,
          year: ranking.year,
          methodologyUrl: ranking.methodologyUrl ?? null,
        }
      : null,
    rank: row.rank ?? null,
    scoreTotal: row.scoreTotal ?? null,
    aum: row.aum ?? null,
    productionT12: row.productionT12 ?? null,
    regulatoryClean: row.regulatoryClean ?? null,
  };
}

/**
 * Picks a default subject-type label based on which subject id column the row populates.
 * @param row RankingEntry row.
 * @returns `firm`, `team`, `advisor`, or `unresolved`.
 */
function inferredRankingSubject(row: RankingEntryRow): string {
  if (row.subjectFirmId) return "firm";
  if (row.subjectTeamId) return "team";
  if (row.subjectAdvisorId) return "advisor";
  return "unresolved";
}

/**
 * Assembles the regulatory-snapshot module from the firm's BrokerCheck snapshot, returning an
 * `unavailable`-status payload when no snapshot is loaded.
 * @param snapshot Loaded BrokerCheck snapshot or null.
 * @returns The regulatory-snapshot module.
 */
export function regulatorySnapshotModule(
  snapshot: FirmBrokerCheckSnapshotSlice | null
): RegulatorySnapshotModule {
  if (!snapshot)
    return {
      status: "unavailable",
      note: "No firm BrokerCheck snapshot is loaded for this firm.",
      snapshot: null,
      source: brokerCheckSource(null, null),
      provenance: { sourceTable: "BrokerCheckSnapshot", sourceIds: [] },
      freshness: freshnessNote(
        null,
        "BrokerCheck freshness is unavailable because no firm snapshot is loaded."
      ),
    };
  return {
    status: "loaded",
    note: "Regulatory values are source-backed by the loaded firm BrokerCheck snapshot.",
    snapshot,
    source: brokerCheckSource(
      snapshot.fetchedAt ?? null,
      snapshot.subjectCrd ?? null
    ),
    provenance: {
      sourceTable: "BrokerCheckSnapshot",
      sourceIds: snapshot.id ? [snapshot.id] : [],
    },
    freshness: freshnessNote(
      snapshot.fetchedAt ?? null,
      "BrokerCheck fetched date is unavailable for this snapshot."
    ),
  };
}

/**
 * Assembles the coverage-timeline module from the firm's mentioned articles, surfacing the five most
 * recent and the overall article count.
 * @param articles Article stubs mentioning the firm.
 * @returns The coverage-timeline module.
 */
export function coverageTimelineModule(
  articles: readonly FirmArticleStubView[] = []
): CoverageTimelineModule {
  return {
    status: articles.length ? "loaded" : "not_found",
    note: articles.length
      ? "Coverage is sourced from article mention rows linked to this firm."
      : "No source articles mention this firm in the loaded article data.",
    recentArticles: articles.slice(0, 5),
    articleCount: articles.length,
    provenance: {
      sourceTables: ["Article", "ArticleFirmMention"],
      sourceIds: articles.map(row => row.id),
    },
    freshness: freshnessNote(
      latestDate(articles, "publishedDate"),
      "Coverage freshness is unavailable because no article publication dates are loaded."
    ),
  };
}

/**
 * Folds the other modules into a high-level confidence summary, marking the report `partial` once
 * any submodule is `loaded` and `unavailable` otherwise.
 * @param modules The other due-diligence modules.
 * @returns The data-confidence module.
 */
export function dataConfidenceModule(
  modules: DueDiligenceModules
): DataConfidenceModule {
  const moduleEntries: readonly DataConfidenceModuleEntry[] = Object.entries(
    modules
  ).map(([name, module]) => ({
    name,
    status: module.status,
    note: module.note,
    freshness: module.freshness ?? null,
  }));
  return {
    status:
      moduleEntries.filter(row => row.status === "loaded").length > 0
        ? "partial"
        : "unavailable",
    note: "Module statuses distinguish loaded rows, explicit no-result states, and unavailable source tables.",
    modules: moduleEntries,
  };
}
