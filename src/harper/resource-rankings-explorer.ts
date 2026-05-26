/* eslint-disable jsdoc/require-jsdoc, functional/immutable-data -- Private aggregation helpers build compact response objects in local maps. */
// @ts-nocheck
import { loadAll } from "./resource-data.js";
import { advisorDisplayName, resolveFirm } from "./resource-routing.js";
import {
  facets,
  filteredEntries,
  normalizeState,
  parseFilters,
  publicEntry,
  publicFilters,
  rankingsCoverage,
  sortEntries,
  summarize,
  topFirms,
} from "./resource-rankings-explorer-utils.js";

/** Public rankings explorer resource. */
export class RankingsExplorer extends Resource {
  /**
   * Allows anonymous readers to inspect source-backed ranking rows.
   * @returns True because rankings explorer data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Loads ranking categories, filters, aggregate summaries, and rows.
   * @param target - Optional route target carrying category, year, firm, state, city, resolved, sort, and limit filters.
   * @returns Source-backed rankings explorer payload.
   */
  async get(target) {
    const db = await loadAll();
    const filters = parseFilters(target, db);
    const entries = filteredEntries(rankingEntries(db), filters);
    const sorted = sortEntries(entries, filters.sort).slice(0, filters.limit);
    return {
      generatedAt: new Date().toISOString(),
      filters: publicFilters(filters),
      facets: facets(rankingEntries(db)),
      summary: summarize(entries),
      coverage: rankingsCoverage(entries),
      topFirms: topFirms(entries),
      items: sorted.map(publicEntry),
      provenance: {
        sourceTables: ["Ranking", "RankingEntry", "FirmAlias"],
        sourceIds: sorted.map(entry => entry.id),
      },
      emptyState:
        entries.length === 0
          ? "No matching public ranking rows are loaded for these filters."
          : null,
    };
  }
}

function rankingEntries(db) {
  return (db.rankingEntries || []).map(row => {
    const ranking = db.byRanking.get(row.rankingId) || null;
    const subject = entrySubject(db, row, ranking);
    const firm = entryFirm(db, row);
    const location = {
      city: row.city || null,
      state: normalizeState(row.state),
      label: [row.city, normalizeState(row.state)].filter(Boolean).join(", "),
    };
    return {
      id: row.id,
      ranking: rankingPayload(ranking, row),
      rank: row.rank ?? null,
      subject,
      firm,
      firmText: row.firmText || firm?.name || null,
      location,
      scores: scorePayload(row),
      metrics: {
        aum: row.aum ?? null,
        productionT12: row.productionT12 ?? null,
        householdCount: row.householdCount ?? null,
        teamSize: row.teamSize ?? null,
      },
      source: {
        url: row.sourceUrl || ranking?.methodologyUrl || null,
        label: row.sourceLabel || ranking?.name || "Ranking source",
        loadedAt: row.loadedAt || null,
      },
      resolutionStatus: resolutionStatus(row, subject),
      sourceStatus: sourceStatus(row, subject, firm, location),
      provenance: {
        sourceTable: "RankingEntry",
        sourceIds: [row.id],
        rankingId: row.rankingId,
      },
      _sort: {
        category: ranking?.name || row.category || "",
        firm: row.firmText || firm?.name || "",
        location: location.label || "",
        name: subject.displayName || row.rawDisplayName || "",
        rank: numericSort(row.rank),
        scale: numericSort(row.scoreScale),
        growth: numericSort(row.scoreGrowth),
        year: ranking?.year || row.year || 0,
      },
    };
  });
}

function rankingPayload(ranking, row) {
  return {
    id: ranking?.id || row.rankingId || null,
    publisher: ranking?.publisher || "AdvisorHub",
    name: ranking?.name || row.category || "Unknown ranking",
    year: ranking?.year ?? row.year ?? null,
    subjectType: ranking?.subjectType || inferredSubjectType(row),
    methodologyUrl: ranking?.methodologyUrl || null,
  };
}

function entrySubject(db, row, ranking) {
  const advisor =
    row.subjectAdvisorId && db.byAdvisor.get(row.subjectAdvisorId);
  if (advisor)
    return {
      kind: "advisor",
      id: advisor.id,
      displayName: advisorDisplayName(advisor),
      url: `/advisor.html?id=${encodeURIComponent(advisor.slug || advisor.id)}`,
    };
  const team = row.subjectTeamId && db.byTeam.get(row.subjectTeamId);
  if (team)
    return {
      kind: "team",
      id: team.id,
      displayName: team.name,
      url: `/team.html?id=${encodeURIComponent(team.slug || team.id)}`,
    };
  const firm = row.subjectFirmId && db.byFirm.get(row.subjectFirmId);
  if (firm)
    return {
      kind: "firm",
      id: firm.id,
      displayName: firm.name,
      url: `/firm.html?id=${encodeURIComponent(firm.slug || firm.id)}`,
    };
  return {
    kind: ranking?.subjectType || inferredSubjectType(row),
    id: null,
    displayName: row.rawDisplayName || "Unresolved ranking row",
    url: null,
  };
}

function entryFirm(db, row) {
  if (row.subjectFirmId) return firmPayload(db.byFirm.get(row.subjectFirmId));
  if (row.firmId) return firmPayload(db.byFirm.get(row.firmId));
  if (row.firmText) return firmPayload(resolveFirm(db, row.firmText));
  const advisorEmployment =
    row.subjectAdvisorId &&
    db.employments
      .filter(employment => employment.advisorId === row.subjectAdvisorId)
      .sort(dateDesc("startDate"))[0];
  return firmPayload(db.byFirm.get(advisorEmployment?.firmId));
}

function firmPayload(firm) {
  return firm
    ? {
        id: firm.id,
        name: firm.name,
        short: firm.name,
        url: `/firm.html?id=${encodeURIComponent(firm.slug || firm.id)}`,
      }
    : null;
}

function scorePayload(row) {
  return {
    total: valueState(row.scoreTotal),
    scale: valueState(row.scoreScale),
    growth: valueState(row.scoreGrowth),
    professionalism: valueState(row.scoreProfessionalism),
  };
}

function valueState(value) {
  return value == null || value === ""
    ? { value: null, status: "unavailable", label: "Unavailable" }
    : { value, status: "loaded", label: String(value) };
}

function resolutionStatus(row, subject) {
  if (subject?.id) return "resolved";
  return row.resolutionStatus || "unresolved";
}

function sourceStatus(row, subject, firm, location) {
  return [
    row.sourceUrl ? "source-backed" : "missing-source",
    subject?.id ? null : "unresolved-entity",
    firm ? null : "unresolved-firm",
    location.state ? null : "missing-state",
    row.scoreScale == null ? "missing-scale" : null,
    row.scoreGrowth == null ? "missing-growth" : null,
  ].filter(Boolean);
}

function inferredSubjectType(row) {
  if (row.subjectFirmId) return "firm";
  if (row.subjectTeamId) return "team";
  return "advisor";
}

function numericSort(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function dateDesc(field) {
  return (left, right) =>
    String(right?.[field] || "").localeCompare(String(left?.[field] || ""));
}

/* eslint-enable jsdoc/require-jsdoc, functional/immutable-data -- End local helper exception. */
