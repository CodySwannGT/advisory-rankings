import type { FirmAliasRow, FirmRow, TeamRow } from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type {
  AdvisorDirectoryRow,
  DirectoryPage,
  SearchResponse,
  TeamDirectoryRow,
} from "./resource-directory-types.js";
import {
  decodeCursor,
  decodeOffsetCursor,
  paginate,
  parsePagination,
} from "./resource-pagination.js";
import {
  canonicalizeForFirmsDirectory,
  canonicalizeForTeamsDirectory,
} from "./resource-firm-canonicalization.js";
import {
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
  compareFirmDirectoryRows,
  compareTeamDirectoryRows,
  firmDirectoryKey,
  teamDirectoryKey,
} from "./resource-directory-sorting.js";
import { runAdvisorDirectoryQuery } from "./resource-directory-advisor-query.js";
import { runGlobalSearch } from "./resource-directory-search-runner.js";

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
   * Lists public advisor rows with cursor pagination. Issues
   * index-backed Harper queries instead of `allRows()` scans — see
   * `.claude/scratch/issue-721-architecture.md` §5.1. The hot path
   * picks the most selective indexed condition (token index for `q`,
   * indexed `firmId` employment lookup for `firm`, Harper-native
   * `search({conditions, sort, limit, offset})` for the no-`q`/no-`firm`
   * directory listing) and applies the remainder as either a row
   * predicate inside the Harper AND-planner or an in-memory filter on
   * the already-bounded candidate set.
   * @param target - Request target carrying optional cursor and limit.
   * @returns Advisor page, next cursor, total row count, and an
   *   optional `truncated` flag when the `q` intersection hit the cap.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<AdvisorDirectoryRow>> {
    const filters = parseAdvisorDirectoryFilters(target);
    const { cursor, limit } = parsePagination(target);
    const offset = decodeOffsetCursor(cursor);
    return runAdvisorDirectoryQuery(filters, offset, limit);
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
   * Searches firms, advisors, and teams for the global navbar. Each
   * entity side runs through its own index-backed prefix path; the
   * actual query orchestration lives in `runGlobalSearch` so this
   * method stays a thin parameter-parse + dispatch.
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
    return runGlobalSearch({ norm, kind, cap });
  }
}
