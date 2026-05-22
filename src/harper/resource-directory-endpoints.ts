// @ts-nocheck
import {
  all,
  decodeCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import {
  advisorSearchMatches,
  currentEmploymentByAdvisor,
  firmSearchMatches,
  searchCounts,
  teamSearchMatches,
} from "./resource-search.js";
/**
 * Public firm directory resource.
 */
export class PublicFirms extends Resource {
  /**
   * Allows anonymous readers to browse canonical firm names.
   * @returns True because firm directory data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Lists firms after alias merges have removed duplicate public rows.
   * @returns Public firm rows sorted by name.
   */
  async get() {
    return [...(await all(tables.Firm))].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }
}

/** Public advisor directory resource. */
export class PublicAdvisors extends Resource {
  /**
   * Allows anonymous readers to browse advisor directory rows.
   * @returns True because advisor directory data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Lists public advisor rows with cursor pagination.
   * @param target - Request target carrying optional cursor and limit.
   * @returns Advisor page, next cursor, and total row count.
   */
  async get(target) {
    const rows = await all(tables.Advisor);
    const keyOf = advisorDirectoryKey;
    const sorted = [...rows].sort(compareAdvisorDirectoryRows);
    const { cursor, limit } = parsePagination(target);
    const { items, nextCursor } = paginate(
      sorted,
      { cursor: decodeCursor(cursor), limit },
      keyOf
    );
    return { items, nextCursor, total: sorted.length };
  }
}

/** Public team directory resource. */
export class PublicTeams extends Resource {
  /**
   * Allows anonymous readers to browse teams and their current firm context.
   * @returns True because team directory data is public.
   */
  allowRead() {
    return true;
  }

  /**
   * Enriches teams with current firm names for directory cards.
   * @returns Team rows sorted by name and enriched with current firm name.
   */
  async get() {
    const [teams, firms] = await Promise.all([
      all(tables.Team),
      all(tables.Firm),
    ]);
    const byFirm = new Map(firms.map(firm => [firm.id, firm]));
    return [...teams]
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(team => ({
        ...team,
        currentFirmName: team.currentFirmId
          ? (byFirm.get(team.currentFirmId)?.name ?? null)
          : null,
      }));
  }
}

/** Global navbar search resource. */
export class Search extends Resource {
  /**
   * Allows the navbar to search public directory data without authentication.
   * @returns True because search only exposes public directory data.
   */
  allowRead() {
    return true;
  }

  /**
   * Searches firms, advisors, and teams for the global navbar.
   * @param target - Request target carrying `q` and optional `limit`.
   * @returns Ranked search matches with per-kind counts.
   */
  async get(target) {
    const norm = String(target?.get?.("q") || "")
      .trim()
      .toLowerCase();
    const cap = Math.min(parsePagination(target).limit, 20);
    if (norm.length < 2)
      return {
        q: norm,
        items: [],
        counts: { firms: 0, advisors: 0, teams: 0, total: 0 },
      };
    const [advisors, firms, teams, employments] = await Promise.all([
      all(tables.Advisor),
      all(tables.Firm),
      all(tables.Team),
      all(tables.EmploymentHistory),
    ]);
    const byFirm = new Map(firms.map(firm => [firm.id, firm]));
    const currentFirmByAdvisor = currentEmploymentByAdvisor(employments);
    const matches = rankedSearchMatches({
      advisors,
      firms,
      teams,
      byFirm,
      currentFirmByAdvisor,
      norm,
    });
    return {
      q: norm,
      items: matches.slice(0, cap).map(({ sortKey, ...row }) => row),
      counts: searchCounts(matches),
    };
  }
}

/**
 * Sorts advisors by their best available surname-like field.
 * @param advisor - Advisor row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
function advisorDirectoryKey(advisor) {
  return (advisor.lastName || advisor.legalName || "").toLowerCase();
}

/**
 * Orders advisor directory rows while keeping cursor ties deterministic.
 * @param a - Left advisor row.
 * @param b - Right advisor row.
 * @returns Negative, zero, or positive comparison result.
 */
function compareAdvisorDirectoryRows(a, b) {
  const left = advisorDirectoryKey(a),
    right = advisorDirectoryKey(b);
  return left === right
    ? (a.id || "").localeCompare(b.id || "")
    : left < right
      ? -1
      : 1;
}
/**
 * Combines cross-entity search matches into one relevance-sorted list.
 * @param parts - Public entity rows and lookup maps needed for scoring.
 * @returns Ranked firm, advisor, and team matches.
 */
function rankedSearchMatches(parts) {
  return [
    ...firmSearchMatches(parts.firms, parts.norm),
    ...advisorSearchMatches(
      parts.advisors,
      parts.byFirm,
      parts.currentFirmByAdvisor,
      parts.norm
    ),
    ...teamSearchMatches(parts.teams, parts.byFirm, parts.norm),
  ].sort(
    (a, b) =>
      b.score - a.score ||
      (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)
  );
}
