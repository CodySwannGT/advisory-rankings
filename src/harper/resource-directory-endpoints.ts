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
import { canonicalizeFirmResourceRows } from "./resource-firm-canonicalization.js";
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
   * @param target - Request target carrying optional cursor and limit.
   * @returns Firm page, next cursor, and total row count.
   */
  async get(target) {
    const rows = canonicalizeFirmResourceRows({
      firms: await all(tables.Firm),
      firmAliases: await optionalAll(tables.FirmAlias),
    });
    const sorted = [...rows.firms].sort(compareFirmDirectoryRows);
    const { cursor, limit } = parsePagination(target);
    const { items, nextCursor } = paginate(
      sorted,
      { cursor: decodeCursor(cursor), limit },
      firmDirectoryKey
    );
    return { items, nextCursor, total: sorted.length };
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
   * @param target - Request target carrying optional cursor and limit.
   * @returns Team page, next cursor, and total row count.
   */
  async get(target) {
    const [teams, firms] = await Promise.all([
      all(tables.Team),
      all(tables.Firm),
    ]);
    const rows = canonicalizeFirmResourceRows({
      teams,
      firms,
      firmAliases: await optionalAll(tables.FirmAlias),
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    const sorted = [...rows.teams].sort(compareTeamDirectoryRows).map(team => ({
      ...team,
      currentFirmName: team.currentFirmId
        ? (byFirm.get(team.currentFirmId)?.name ?? null)
        : null,
    }));
    const { cursor, limit } = parsePagination(target);
    const { items, nextCursor } = paginate(
      sorted,
      { cursor: decodeCursor(cursor), limit },
      teamDirectoryKey
    );
    return { items, nextCursor, total: sorted.length };
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
    const kind = parseSearchKind(target);
    if (norm.length < 2)
      return {
        q: norm,
        kind,
        items: [],
        counts: { firms: 0, advisors: 0, teams: 0, total: 0 },
      };
    const [advisors, firms, teams, employments, firmAliases] =
      await Promise.all([
        all(tables.Advisor),
        all(tables.Firm),
        all(tables.Team),
        all(tables.EmploymentHistory),
        optionalAll(tables.FirmAlias),
      ]);
    const rows = canonicalizeFirmResourceRows({
      firms,
      teams,
      employments,
      firmAliases,
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    const currentFirmByAdvisor = currentEmploymentByAdvisor(rows.employments);
    const matches = rankedSearchMatches({
      advisors,
      firms: rows.firms,
      teams: rows.teams,
      byFirm,
      currentFirmByAdvisor,
      norm,
    }).filter(match => kind === "all" || match.kind === kind);
    return {
      q: norm,
      kind,
      items: matches.slice(0, cap).map(({ sortKey, ...row }) => row),
      counts: searchCounts(matches),
    };
  }
}

/**
 * Parses the optional search-kind filter used by public `/Search` requests.
 * @param target - Request target carrying an optional `kind` query param.
 * @returns A bounded search kind, defaulting to `all` for missing/invalid input.
 */
function parseSearchKind(target) {
  const kind = String(target?.get?.("kind") || "all")
    .trim()
    .toLowerCase();
  return ["firm", "advisor", "team"].includes(kind) ? kind : "all";
}

/**
 * Reads an optional Harper table that may be absent during rolling deploys.
 * @param table - Harper table handle, when this schema has the table.
 * @returns Rows from the table, or an empty array when unavailable.
 */
async function optionalAll(table) {
  return table ? all(table) : [];
}

/**
 * Sorts firms by public display name.
 * @param firm - Firm row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
function firmDirectoryKey(firm) {
  return (firm.name || "").toLowerCase();
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
 * Sorts teams by public display name.
 * @param team - Team row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
function teamDirectoryKey(team) {
  return (team.name || "").toLowerCase();
}

/**
 * Orders firm directory rows while keeping cursor ties deterministic.
 * @param a - Left firm row.
 * @param b - Right firm row.
 * @returns Negative, zero, or positive comparison result.
 */
function compareFirmDirectoryRows(a, b) {
  return compareDirectoryRows(a, b, firmDirectoryKey);
}

/**
 * Orders advisor directory rows while keeping cursor ties deterministic.
 * @param a - Left advisor row.
 * @param b - Right advisor row.
 * @returns Negative, zero, or positive comparison result.
 */
function compareAdvisorDirectoryRows(a, b) {
  return compareDirectoryRows(a, b, advisorDirectoryKey);
}

/**
 * Orders team directory rows while keeping cursor ties deterministic.
 * @param a - Left team row.
 * @param b - Right team row.
 * @returns Negative, zero, or positive comparison result.
 */
function compareTeamDirectoryRows(a, b) {
  return compareDirectoryRows(a, b, teamDirectoryKey);
}

/**
 * Applies the shared cursor sort contract to directory resources.
 * @param a - Left directory row.
 * @param b - Right directory row.
 * @param keyOf - Sort-key callback used by pagination.
 * @returns Negative, zero, or positive comparison result.
 */
function compareDirectoryRows(a, b, keyOf) {
  const left = keyOf(a),
    right = keyOf(b);
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
