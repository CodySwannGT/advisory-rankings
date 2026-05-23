// @ts-nocheck
import { cmpDesc } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";

/**
 * Scores an entity name against the normalized query.
 * @param name - Candidate display, legal, or alias name.
 * @param query - Lowercased user search query.
 * @returns Match strength used for sorting search results.
 */
function scoreName(name, query) {
  if (!name) return 0;
  const normalized = String(name).toLowerCase();
  if (normalized === query) return 3;
  if (normalized.startsWith(query)) return 2;
  const wordPrefix = normalized
    .split(/\s+/u)
    .some(word => word.startsWith(query));
  return wordPrefix ? 2 : normalized.includes(query) ? 1 : 0;
}

/**
 * Finds each advisor's latest current employment row for search subtitles.
 * @param employments - Employment rows loaded from Harper.
 * @returns Map keyed by advisor ID.
 */
export function currentEmploymentByAdvisor(employments) {
  const current = new Map();
  for (const employment of employments) {
    if (employment.endDate) continue;
    const existing = current.get(employment.advisorId);
    if (!existing || cmpDesc("startDate")(employment, existing) < 0) {
      // eslint-disable-next-line functional/immutable-data -- local accumulator keeps navbar search linear on large datasets.
      current.set(employment.advisorId, employment);
    }
  }
  return current;
}

/**
 * Builds ranked firm search matches.
 * @param firms - Firm rows loaded from Harper.
 * @param query - Lowercased user search query.
 * @returns Firm matches with search metadata.
 */
export function firmSearchMatches(firms, query) {
  return firms
    .map(firm => ({
      firm,
      score: Math.max(
        scoreName(firm.name, query),
        scoreName(firm.legalName, query)
      ),
    }))
    .filter(({ score }) => score)
    .map(({ firm, score }) => ({
      kind: "firm",
      id: firm.id,
      name: firm.name,
      sub:
        [firm.hqCity, firm.hqState].filter(Boolean).join(", ") ||
        firm.channel ||
        null,
      score: score + 0.5,
      sortKey: (firm.name || "").toLowerCase(),
    }));
}

/**
 * Builds ranked advisor search matches with current-firm subtitles.
 * @param advisors - Advisor rows loaded from Harper.
 * @param byFirm - Firm lookup keyed by firm ID.
 * @param currentFirmByAdvisor - Latest current employment keyed by advisor ID.
 * @param query - Lowercased user search query.
 * @returns Advisor matches with search metadata.
 */
export function advisorSearchMatches(
  advisors,
  byFirm,
  currentFirmByAdvisor,
  query
) {
  return advisors
    .map(advisor => ({
      advisor,
      display: advisorDisplayName(advisor) || advisor.legalName,
    }))
    .map(({ advisor, display }) => ({
      advisor,
      display,
      score: Math.max(
        scoreName(display, query),
        scoreName(advisor.legalName, query),
        scoreName(advisor.preferredName, query),
        scoreName(advisor.firstName, query),
        scoreName(advisor.lastName, query)
      ),
    }))
    .filter(({ score }) => score)
    .map(({ advisor, display, score }) => {
      const employment = currentFirmByAdvisor.get(advisor.id);
      const firm = employment ? byFirm.get(employment.firmId) : null;
      return {
        kind: "advisor",
        id: advisor.id,
        name: display,
        sub: firm ? firm.name : advisor.careerStatus || null,
        score,
        sortKey: (advisor.lastName || display || "").toLowerCase(),
      };
    });
}

/**
 * Builds ranked team search matches.
 * @param teams - Team rows loaded from Harper.
 * @param byFirm - Firm lookup keyed by firm ID.
 * @param query - Lowercased user search query.
 * @returns Team matches with search metadata.
 */
export function teamSearchMatches(teams, byFirm, query) {
  return teams
    .map(team => ({ team, score: scoreName(team.name, query) }))
    .filter(({ score }) => score)
    .map(({ team, score }) => {
      const firm = team.currentFirmId ? byFirm.get(team.currentFirmId) : null;
      return {
        kind: "team",
        id: team.id,
        name: team.name,
        sub: firm ? firm.name : null,
        score,
        sortKey: (team.name || "").toLowerCase(),
      };
    });
}

/**
 * Counts search matches by entity kind.
 * @param matches - Combined ranked search matches.
 * @returns Count object consumed by the navbar dropdown.
 */
export function searchCounts(matches) {
  return {
    firms: matches.filter(match => match.kind === "firm").length,
    advisors: matches.filter(match => match.kind === "advisor").length,
    teams: matches.filter(match => match.kind === "team").length,
    total: matches.length,
  };
}
