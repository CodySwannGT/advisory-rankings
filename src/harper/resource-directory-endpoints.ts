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
import { advisorDisplayName } from "./resource-routing.js";
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
    const filters = parseFirmDirectoryFilters(target);
    const filtered = rows.firms.filter(firm =>
      firmMatchesFilters(firm, filters)
    );
    const sorted = [...filtered].sort(compareFirmDirectoryRows);
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
    const [advisors, firms, employments, firmAliases] = await Promise.all([
      all(tables.Advisor),
      all(tables.Firm),
      all(tables.EmploymentHistory),
      optionalAll(tables.FirmAlias),
    ]);
    const rows = canonicalizeFirmResourceRows({
      firms,
      employments,
      firmAliases,
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    const currentFirmByAdvisor = currentEmploymentByAdvisor(rows.employments);
    const filters = parseAdvisorDirectoryFilters(target);
    const keyOf = advisorDirectoryKey;
    const filtered = advisors.filter(advisor =>
      advisorMatchesFilters(advisor, filters, currentFirmByAdvisor, byFirm)
    );
    const sorted = [...filtered].sort(compareAdvisorDirectoryRows);
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
    const filters = parseTeamDirectoryFilters(target);
    const filtered = rows.teams
      .filter(team => teamMatchesFilters(team, filters, byFirm))
      .map(team => ({
        ...team,
        currentFirmName: team.currentFirmId
          ? (byFirm.get(team.currentFirmId)?.name ?? null)
          : null,
      }));
    const sorted = [...filtered].sort(compareTeamDirectoryRows);
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
 * Parses advisor directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized advisor filter values.
 */
function parseAdvisorDirectoryFilters(target) {
  return {
    q: normalizedParam(target, "q"),
    firm: normalizedParam(target, "firm"),
    careerStatus: normalizedParam(target, "careerStatus"),
    hasCrd: booleanParam(target, "hasCrd"),
  };
}

/**
 * Parses firm directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized firm filter values.
 */
function parseFirmDirectoryFilters(target) {
  return {
    q: normalizedParam(target, "q"),
    channel: normalizedParam(target, "channel"),
    state: normalizedParam(target, "state"),
    active: activeParam(target),
  };
}

/**
 * Parses team directory filters from public query parameters.
 * @param target - Request target carrying URL search params.
 * @returns Normalized team filter values.
 */
function parseTeamDirectoryFilters(target) {
  return {
    q: normalizedParam(target, "q"),
    firm: normalizedParam(target, "firm"),
    serviceModel: normalizedParam(target, "serviceModel"),
  };
}

/**
 * Checks an advisor against supported public directory filters.
 * @param advisor - Advisor row from the public table.
 * @param filters - Normalized advisor filters.
 * @param currentFirmByAdvisor - Current-employment lookup keyed by advisor ID.
 * @param byFirm - Canonical firm lookup keyed by firm ID.
 * @returns Whether the advisor should be included in the response.
 */
function advisorMatchesFilters(advisor, filters, currentFirmByAdvisor, byFirm) {
  const employment = currentFirmByAdvisor.get(advisor.id);
  const firm = employment ? byFirm.get(employment.firmId) : null;
  return (
    textMatches(filters.q, [
      advisorDisplayName(advisor),
      advisor.legalName,
      advisor.preferredName,
      advisor.firstName,
      advisor.lastName,
    ]) &&
    textMatches(filters.firm, [employment?.firmId, firm?.id, firm?.name]) &&
    exactMatches(filters.careerStatus, advisor.careerStatus) &&
    booleanMatches(filters.hasCrd, Boolean(advisor.finraCrd))
  );
}

/**
 * Checks a firm against supported public directory filters.
 * @param firm - Canonical firm row.
 * @param filters - Normalized firm filters.
 * @returns Whether the firm should be included in the response.
 */
function firmMatchesFilters(firm, filters) {
  return (
    textMatches(filters.q, [firm.name, firm.legalName]) &&
    exactMatches(filters.channel, firm.channel) &&
    exactMatches(filters.state, firm.hqState) &&
    booleanMatches(filters.active, !firm.dissolvedYear)
  );
}

/**
 * Checks a team against supported public directory filters.
 * @param team - Team row.
 * @param filters - Normalized team filters.
 * @param byFirm - Canonical firm lookup keyed by firm ID.
 * @returns Whether the team should be included in the response.
 */
function teamMatchesFilters(team, filters, byFirm) {
  const firm = team.currentFirmId ? byFirm.get(team.currentFirmId) : null;
  return (
    textMatches(filters.q, [team.name]) &&
    textMatches(filters.firm, [team.currentFirmId, firm?.id, firm?.name]) &&
    exactMatches(filters.serviceModel, team.serviceModel)
  );
}

/**
 * Reads a lowercased string query parameter.
 * @param target - Request target carrying URL search params.
 * @param name - Query parameter name.
 * @returns Normalized value, or empty string when absent.
 */
function normalizedParam(target, name) {
  return String(target?.get?.(name) || "")
    .trim()
    .toLowerCase();
}

/**
 * Parses boolean-like query parameters.
 * @param target - Request target carrying URL search params.
 * @param name - Query parameter name.
 * @returns Boolean filter, or null when absent/invalid.
 */
function booleanParam(target, name) {
  const value = normalizedParam(target, name);
  if (["true", "1", "yes"].includes(value)) return true;
  if (["false", "0", "no"].includes(value)) return false;
  return null;
}

/**
 * Parses the active/dissolved firm status filter.
 * @param target - Request target carrying URL search params.
 * @returns Active-state filter, or null when absent/invalid.
 */
function activeParam(target) {
  const active = booleanParam(target, "active");
  if (active !== null) return active;
  const status = normalizedParam(target, "status");
  if (status === "active") return true;
  if (["dissolved", "inactive"].includes(status)) return false;
  return null;
}

/**
 * Applies case-insensitive substring matching across candidate fields.
 * @param query - Normalized query string.
 * @param values - Candidate values.
 * @returns True when the query is empty or a candidate contains it.
 */
function textMatches(query, values) {
  return !query || values.some(value => normalizeValue(value).includes(query));
}

/**
 * Applies case-insensitive exact matching.
 * @param query - Normalized query string.
 * @param value - Candidate value.
 * @returns True when the query is empty or equals the normalized value.
 */
function exactMatches(query, value) {
  return !query || normalizeValue(value) === query;
}

/**
 * Applies optional boolean matching.
 * @param expected - Desired boolean value.
 * @param actual - Candidate boolean value.
 * @returns True when no boolean filter is active or the value matches.
 */
function booleanMatches(expected, actual) {
  return expected === null || actual === expected;
}

/**
 * Normalizes arbitrary row values for filter comparison.
 * @param value - Candidate row value.
 * @returns Lowercased string value.
 */
function normalizeValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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
