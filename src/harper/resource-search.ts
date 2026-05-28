import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { SearchCounts, SearchMatch } from "./resource-directory-types.js";
import { cmpDesc } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";

/**
 * Scores an entity name against the normalized query.
 * @param name - Candidate display, legal, or alias name.
 * @param query - Lowercased user search query.
 * @returns Match strength used for sorting search results.
 */
function scoreName(name: string | null | undefined, query: string): number {
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
 *
 * O(n log n): copies the input, drops ended employments, then orders the
 * remaining rows so each advisor's winning row lands last within its group
 * and constructs the result with a single `new Map(entries)` pass (the Map
 * constructor keeps the last entry per key). The ordering is ascending by
 * `startDate` with original-index descending as the tie-break, which makes
 * the most-recent `startDate` win and, on equal `startDate`, preserves the
 * first-seen row exactly as the prior O(n^2) `cmpDesc("startDate") >= 0`
 * dedupe did. Construction is fully immutable — no `let`, no mutation of the
 * input or of an intermediate Map.
 * @param employments - Employment rows loaded from Harper.
 * @returns Map keyed by advisor ID.
 */
export function currentEmploymentByAdvisor(
  employments: ReadonlyArray<EmploymentHistoryRow>
): ReadonlyMap<string, EmploymentHistoryRow> {
  const byStart = cmpDesc("startDate");
  const ordered = [...employments]
    .map((employment, index) => ({ employment, index }))
    .filter(({ employment }) => !employment.endDate)
    .sort(
      (a, b) =>
        // Winner last: oldest startDate first (cmpDesc is newest-first, so
        // negate it), and on a startDate tie the higher index sorts first so
        // the first-seen (lowest index) row lands last and wins.
        -byStart(a.employment, b.employment) || b.index - a.index
    );
  return new Map(
    ordered.map(({ employment }) => [employment.advisorId, employment])
  );
}

/**
 * Resolves each advisor's current-firm display name from a SCOPED set of
 * employment rows (e.g. only the rows fetched for the displayed search
 * slice), reusing {@link currentEmploymentByAdvisor} to pick the current
 * employment and `byFirm` to resolve the firm name. Only advisors whose
 * current firm resolves to a known firm are present in the result; advisors
 * with no current employment or an unresolved firm are omitted so callers
 * fall back to `careerStatus` exactly as {@link advisorSearchMatches} does.
 * Lets the global search avoid loading the entire EmploymentHistory table
 * just to render subtitles for at most a page of advisors.
 * @param employments - Canonicalized employment rows for the scoped advisors.
 * @param byFirm - Firm lookup keyed by firm ID.
 * @returns Map of advisor ID to resolved current firm name.
 */
export function currentFirmNameByAdvisor(
  employments: ReadonlyArray<EmploymentHistoryRow>,
  byFirm: ReadonlyMap<string, FirmRow>
): ReadonlyMap<string, string> {
  const current = currentEmploymentByAdvisor(employments);
  return new Map(
    [...current.entries()]
      .map(([advisorId, employment]): readonly [string, string | undefined] => [
        advisorId,
        byFirm.get(employment.firmId)?.name,
      ])
      .filter(
        (entry): entry is readonly [string, string] => entry[1] !== undefined
      )
  );
}

/**
 * Builds ranked firm search matches.
 * @param firms - Firm rows loaded from Harper.
 * @param query - Lowercased user search query.
 * @returns Firm matches with search metadata.
 */
export function firmSearchMatches(
  firms: ReadonlyArray<FirmRow>,
  query: string
): ReadonlyArray<SearchMatch> {
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
  advisors: ReadonlyArray<AdvisorRow>,
  byFirm: ReadonlyMap<string, FirmRow>,
  currentFirmByAdvisor: ReadonlyMap<string, EmploymentHistoryRow>,
  query: string
): ReadonlyArray<SearchMatch> {
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
export function teamSearchMatches(
  teams: ReadonlyArray<TeamRow>,
  byFirm: ReadonlyMap<string, FirmRow>,
  query: string
): ReadonlyArray<SearchMatch> {
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
export function searchCounts(
  matches: ReadonlyArray<SearchMatch>
): SearchCounts {
  return {
    firms: matches.filter(match => match.kind === "firm").length,
    advisors: matches.filter(match => match.kind === "advisor").length,
    teams: matches.filter(match => match.kind === "team").length,
    total: matches.length,
  };
}
