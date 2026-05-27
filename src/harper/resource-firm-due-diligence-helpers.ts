/* eslint-disable jsdoc/require-jsdoc -- Private helper names are descriptive and kept local to this resource module. */

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
    recentMoves: all
      .slice()
      .sort(dateDesc("moveDate"))
      .slice(0, 5)
      .map(
        (move): RecentTransitionMove => ({
          id: move.id,
          direction:
            transitionFirmId(move.toFirm) === firmId ? "inbound" : "outbound",
          subject: move.subject,
          fromFirm: move.fromFirm,
          toFirm: move.toFirm,
          moveDate: move.moveDate ?? null,
          aumMoved: move.aumMoved ?? null,
        })
      ),
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

function inferredRankingSubject(row: RankingEntryRow): string {
  if (row.subjectFirmId) return "firm";
  if (row.subjectTeamId) return "team";
  if (row.subjectAdvisorId) return "advisor";
  return "unresolved";
}

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

/* eslint-enable jsdoc/require-jsdoc -- End local private-helper exception. */
