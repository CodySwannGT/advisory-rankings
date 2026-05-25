/* eslint-disable jsdoc/require-jsdoc -- Private helper names are descriptive and kept local to this resource module. */
// @ts-nocheck
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SOURCE_URL = "https://brokercheck.finra.org/";

/**
 * Builds due-diligence modules for a canonical public firm profile.
 * @param db - Loaded resource index bundle.
 * @param firmId - Canonical firm ID requested by the route.
 * @param profile - Existing firm profile rows already resolved for callers.
 * @returns Structured due-diligence modules with source and availability notes.
 */
export function firmDueDiligenceModules(db, firmId, profile) {
  const rankings = rankingRows(db, firmId);
  const modules = {
    recruitingMomentum: recruitingMomentumModule(
      firmId,
      profile.transitionsIn,
      profile.transitionsOut
    ),
    rosterFootprint: rosterFootprintModule(profile),
    rankingPresence: rankingPresenceModule(db, rankings),
    regulatorySnapshot: regulatorySnapshotModule(profile.brokerCheckSnapshot),
    coverageTimeline: coverageTimelineModule(profile.articles),
  };
  return {
    generatedAt: new Date().toISOString(),
    firmId,
    modules,
    dataConfidence: dataConfidenceModule(modules),
  };
}

function recruitingMomentumModule(
  firmId,
  transitionsIn = [],
  transitionsOut = []
) {
  const inbound = summarizeTransitions(transitionsIn);
  const outbound = summarizeTransitions(transitionsOut);
  const hasData = transitionsIn.length + transitionsOut.length > 0;
  return {
    status: hasData ? "loaded" : "not_found",
    note: hasData
      ? "Calculated from canonical TransitionEvent rows for this firm."
      : "No transition rows are loaded for this firm.",
    inbound,
    outbound,
    netMoveCount: inbound.count - outbound.count,
    netAumMoved: inbound.knownAum - outbound.knownAum,
    recentMoves: [...transitionsIn, ...transitionsOut]
      .sort(dateDesc("moveDate"))
      .slice(0, 5)
      .map(move => ({
        id: move.id,
        direction: move.toFirm?.id === firmId ? "inbound" : "outbound",
        subject: move.subject,
        fromFirm: move.fromFirm,
        toFirm: move.toFirm,
        moveDate: move.moveDate,
        aumMoved: move.aumMoved ?? null,
      })),
    provenance: {
      sourceTable: "TransitionEvent",
      sourceIds: [...transitionsIn, ...transitionsOut].map(row => row.id),
    },
    freshness: freshnessNote(
      latestDate([...transitionsIn, ...transitionsOut], "moveDate"),
      "No transition move date is loaded for this firm."
    ),
  };
}

function summarizeTransitions(rows) {
  return rows.reduce(
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

function rosterFootprintModule(profile) {
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
      profile.brokerCheckSnapshot?.fetchedAt,
      "Roster freshness date is unavailable; BrokerCheck fetched date is the closest loaded source timestamp."
    ),
    provenance: {
      sourceTables: ["EmploymentHistory", "Team", "Branch"],
    },
  };
}

function rankingPresenceModule(db, rows) {
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
  return {
    status: "loaded",
    note: "Ranking appearances are grouped from loaded RankingEntry rows.",
    appearances,
    resolvedCount: appearances.filter(row => row.ranking).length,
    unresolvedCount: appearances.filter(row => !row.ranking).length,
    topRank:
      appearances
        .map(row => row.rank)
        .filter(rank => Number.isFinite(rank))
        .sort((a, b) => a - b)[0] ?? null,
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

function rankingRows(db, firmId) {
  const firmAdvisorIds = new Set(
    db.employments
      .filter(row => row.firmId === firmId)
      .map(row => row.advisorId)
      .filter(Boolean)
  );
  const firmTeamIds = new Set(
    db.teams
      .filter(row => row.currentFirmId === firmId)
      .map(row => row.id)
      .filter(Boolean)
  );
  return (db.rankingEntries || []).filter(
    row =>
      row.subjectFirmId === firmId ||
      firmAdvisorIds.has(row.subjectAdvisorId) ||
      firmTeamIds.has(row.subjectTeamId)
  );
}

function rankingAppearance(db, row) {
  const ranking = db.byRanking.get(row.rankingId) || null;
  return {
    id: row.id,
    subjectType: ranking?.subjectType || inferredRankingSubject(row),
    ranking: ranking && {
      id: ranking.id,
      publisher: ranking.publisher,
      name: ranking.name,
      year: ranking.year,
      methodologyUrl: ranking.methodologyUrl || null,
    },
    rank: row.rank ?? null,
    scoreTotal: row.scoreTotal ?? null,
    aum: row.aum ?? null,
    productionT12: row.productionT12 ?? null,
    regulatoryClean: row.regulatoryClean ?? null,
  };
}

function inferredRankingSubject(row) {
  if (row.subjectFirmId) return "firm";
  if (row.subjectTeamId) return "team";
  if (row.subjectAdvisorId) return "advisor";
  return "unresolved";
}

function regulatorySnapshotModule(snapshot) {
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
    source: brokerCheckSource(snapshot.fetchedAt, snapshot.subjectCrd),
    provenance: {
      sourceTable: "BrokerCheckSnapshot",
      sourceIds: [snapshot.id].filter(Boolean),
    },
    freshness: freshnessNote(
      snapshot.fetchedAt,
      "BrokerCheck fetched date is unavailable for this snapshot."
    ),
  };
}

function brokerCheckSource(fetchedAt, subjectCrd) {
  return {
    sourceName: "FINRA BrokerCheck",
    sourceUrl: subjectCrd
      ? `${BROKERCHECK_SOURCE_URL}firm/summary/${encodeURIComponent(subjectCrd)}`
      : BROKERCHECK_SOURCE_URL,
    termsUrl: BROKERCHECK_TERMS_URL,
    compiledAsOf: fetchedAt ?? null,
  };
}

function coverageTimelineModule(articles = []) {
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

function dataConfidenceModule(modules) {
  const moduleEntries = Object.entries(modules).map(([name, module]) => ({
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

function freshnessNote(date, fallback) {
  return date
    ? { status: "loaded", asOf: date, note: "Source timestamp loaded." }
    : {
        status: "unavailable",
        asOf: null,
        note: fallback,
      };
}

function dateDesc(field) {
  return (left, right) =>
    String(right?.[field] || "").localeCompare(String(left?.[field] || ""));
}

function latestDate(rows, field) {
  return (
    rows
      .map(row => row?.[field])
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

function latestRankingYear(appearances) {
  const year = appearances
    .map(row => row.ranking?.year)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right)
    .at(-1);
  return year ? String(year) : null;
}

/* eslint-enable jsdoc/require-jsdoc -- End local private-helper exception. */
