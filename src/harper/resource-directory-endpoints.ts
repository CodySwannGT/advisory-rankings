import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";
import {
  decodeCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import { currentEmploymentByAdvisor, searchCounts } from "./resource-search.js";
import {
  canonicalizeForAdvisorsDirectory,
  canonicalizeForFirmsDirectory,
  canonicalizeForSearch,
  canonicalizeForTeamsDirectory,
} from "./resource-firm-canonicalization.js";
import {
  advisorMatchesFilters,
  firmMatchesFilters,
  parseAdvisorDirectoryFilters,
  parseFirmDirectoryFilters,
  parseSearchKind,
  parseTeamDirectoryFilters,
  teamMatchesFilters,
  queryValue,
} from "./resource-directory-filters.js";
import { allRows, optionalAll } from "./resource-directory-tables.js";
import {
  advisorDirectoryKey,
  compareAdvisorDirectoryRows,
  compareFirmDirectoryRows,
  compareTeamDirectoryRows,
  firmDirectoryKey,
  rankedSearchMatches,
  teamDirectoryKey,
} from "./resource-directory-sorting.js";
import type {
  DirectoryPage,
  SearchResponse,
  TeamDirectoryRow,
} from "./resource-directory-types.js";

export type {
  SearchCounts,
  SearchResponse,
} from "./resource-directory-types.js";

/**
 * Public firm directory resource.
 */
export class PublicFirms extends Resource {
  /**
   * Allows anonymous readers to browse canonical firm names.
   * @returns True because firm directory data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Lists firms after alias merges have removed duplicate public rows.
   * @param target - Request target carrying optional cursor and limit.
   * @returns Firm page, next cursor, and total row count.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<FirmRow>> {
    const rows = canonicalizeForFirmsDirectory({
      firms: await allRows<FirmRow>(tables.Firm),
      firmAliases: await optionalAll<FirmAliasRow>(tables.FirmAlias),
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
  allowRead(): boolean {
    return true;
  }

  /**
   * Lists public advisor rows with cursor pagination.
   * @param target - Request target carrying optional cursor and limit.
   * @returns Advisor page, next cursor, and total row count.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<AdvisorRow>> {
    const [advisors, firms, employments, firmAliases] = await Promise.all([
      allRows<AdvisorRow>(tables.Advisor),
      allRows<FirmRow>(tables.Firm),
      allRows<EmploymentHistoryRow>(tables.EmploymentHistory),
      optionalAll<FirmAliasRow>(tables.FirmAlias),
    ]);
    const rows = canonicalizeForAdvisorsDirectory({
      firms,
      employments,
      firmAliases,
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    const currentFirmByAdvisor = currentEmploymentByAdvisor(
      rows.employments
    ) as ReadonlyMap<string, EmploymentHistoryRow>;
    const filters = parseAdvisorDirectoryFilters(target);
    const filtered = advisors.filter(advisor =>
      advisorMatchesFilters(advisor, filters, currentFirmByAdvisor, byFirm)
    );
    const sorted = [...filtered].sort(compareAdvisorDirectoryRows);
    const { cursor, limit } = parsePagination(target);
    const { items, nextCursor } = paginate(
      sorted,
      { cursor: decodeCursor(cursor), limit },
      advisorDirectoryKey
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
  allowRead(): boolean {
    return true;
  }

  /**
   * Enriches teams with current firm names for directory cards.
   * @param target - Request target carrying optional cursor and limit.
   * @returns Team page, next cursor, and total row count.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<TeamDirectoryRow>> {
    const [teams, firms] = await Promise.all([
      allRows<TeamRow>(tables.Team),
      allRows<FirmRow>(tables.Firm),
    ]);
    const rows = canonicalizeForTeamsDirectory({
      teams,
      firms,
      firmAliases: await optionalAll<FirmAliasRow>(tables.FirmAlias),
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
  allowRead(): boolean {
    return true;
  }

  /**
   * Searches firms, advisors, and teams for the global navbar.
   * @param target - Request target carrying `q` and optional `limit`.
   * @returns Ranked search matches with per-kind counts.
   */
  async get(target?: RouteTarget): Promise<SearchResponse> {
    const norm = String(queryValue(target, "q") || "")
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
        allRows<AdvisorRow>(tables.Advisor),
        allRows<FirmRow>(tables.Firm),
        allRows<TeamRow>(tables.Team),
        allRows<EmploymentHistoryRow>(tables.EmploymentHistory),
        optionalAll<FirmAliasRow>(tables.FirmAlias),
      ]);
    const rows = canonicalizeForSearch({
      firms,
      teams,
      employments,
      firmAliases,
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    const currentFirmByAdvisor = currentEmploymentByAdvisor(
      rows.employments
    ) as ReadonlyMap<string, EmploymentHistoryRow>;
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
