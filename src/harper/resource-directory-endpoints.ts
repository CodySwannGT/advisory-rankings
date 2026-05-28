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
import { searchCounts } from "./resource-search.js";
import {
  canonicalizeForFirmsDirectory,
  canonicalizeForSearch,
  canonicalizeForTeamsDirectory,
} from "./resource-firm-canonicalization.js";
import {
  advisorsMatchingFirm,
  resolveDisplayedAdvisorFirms,
} from "./resource-directory-advisor-firm.js";
import {
  advisorMatchesNonFirmFilters,
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
    const filters = parseAdvisorDirectoryFilters(target);
    // When a `firm` filter is active, drive the result from the firm's current
    // employees (a bounded, indexed `firmId` lookup) and load ONLY those
    // advisors by id — never scanning the 13k-row Advisor table. Without a
    // firm filter the directory genuinely enumerates all advisors to sort and
    // paginate them, so the full load is unavoidable there.
    const matched = filters.firm
      ? await advisorsMatchingFirm(filters, filters.firm)
      : (await allRows<AdvisorRow>(tables.Advisor)).filter(advisor =>
          advisorMatchesNonFirmFilters(advisor, filters)
        );
    const sorted = [...matched].sort(compareAdvisorDirectoryRows);
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
    // Load only the tables the requested kind actually needs. A kind-scoped
    // request (e.g. the navbar "Firms"/"Teams" toggles) must not scan the
    // 13k-row Advisor table just to discard it via the kind filter below —
    // that needless load made `kind=firm` searches flake past the smoke's
    // timeout under concurrent load. Firms stay loaded for every kind because
    // they back the advisor/team subtitle (`byFirm`) as well as firm results.
    // EmploymentHistory is never scanned here; per-displayed-advisor rows are
    // fetched below via the `advisorId` index.
    const needAdvisors = kind === "all" || kind === "advisor";
    const needTeams = kind === "all" || kind === "team";
    const [advisors, firms, teams, firmAliases] = await Promise.all([
      needAdvisors
        ? allRows<AdvisorRow>(tables.Advisor)
        : Promise.resolve<readonly AdvisorRow[]>([]),
      allRows<FirmRow>(tables.Firm),
      needTeams
        ? allRows<TeamRow>(tables.Team)
        : Promise.resolve<readonly TeamRow[]>([]),
      optionalAll<FirmAliasRow>(tables.FirmAlias),
    ]);
    // Canonicalize firms/teams with an empty employment set: firm/team
    // scoring and the `byFirm` subtitle map do not depend on employments,
    // and the advisor subtitle is resolved separately below.
    const rows = canonicalizeForSearch({
      firms,
      teams,
      employments: [],
      firmAliases,
    });
    const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
    // Pass an EMPTY current-employment map so advisor subtitles fall back to
    // careerStatus during scoring. Score, sortKey, counts, and ordering do
    // not depend on `sub`, so this is safe; subtitles are overridden below.
    const matches = rankedSearchMatches({
      advisors,
      firms: rows.firms,
      teams: rows.teams,
      byFirm,
      currentFirmByAdvisor: new Map<string, EmploymentHistoryRow>(),
      norm,
    }).filter(match => kind === "all" || match.kind === kind);
    const displayed = matches.slice(0, cap);
    // Fetch current employment ONLY for the advisors actually displayed.
    const advisorIds = displayed
      .filter(match => match.kind === "advisor")
      .map(match => match.id);
    const subtitleByAdvisor = await resolveDisplayedAdvisorFirms(
      advisorIds,
      firms,
      teams,
      firmAliases,
      byFirm
    );
    const advisorById = new Map(advisors.map(advisor => [advisor.id, advisor]));
    return {
      q: norm,
      kind,
      items: displayed.map(({ sortKey, ...row }) =>
        row.kind === "advisor"
          ? {
              ...row,
              // Mirror advisorSearchMatches exactly: resolved firm name, else
              // `careerStatus || null` (empty string folds to null).
              sub:
                subtitleByAdvisor.get(row.id) ??
                (advisorById.get(row.id)?.careerStatus || null),
            }
          : row
      ),
      counts: searchCounts(matches),
    };
  }
}
