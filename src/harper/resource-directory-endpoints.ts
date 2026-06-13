import type {
  BranchRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type {
  AdvisorDirectoryRow,
  BranchDirectoryRow,
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
  parseBranchDirectoryFilters,
  parseFirmDirectoryFilters,
  parseSearchKind,
  parseTeamDirectoryFilters,
  teamMatchesFilters,
  branchMatchesFilters,
  queryValue,
} from "./resource-directory-filters.js";
import {
  allRows,
  optionalAll,
  rowsByAttribute,
} from "./resource-directory-tables.js";
import {
  compareFirmDirectoryRows,
  compareTeamDirectoryRows,
  compareBranchDirectoryRows,
  branchDirectoryKey,
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

/** Public branch directory resource. */
export class PublicBranches extends Resource {
  /**
   * Allows anonymous readers to browse public branch rows.
   * @returns True because branch directory data is public.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Lists public branch rows with firm context and source-backed counts.
   * @param target - Request target carrying optional filters and pagination.
   * @returns Branch page, next cursor, and total row count.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<BranchDirectoryRow>> {
    const [branches, firms] = await Promise.all([
      allRows<BranchRow>(tables.Branch),
      allRows<FirmRow>(tables.Firm),
    ]);
    const byFirm = new Map(firms.map(firm => [firm.id, firm]));
    const filters = parseBranchDirectoryFilters(target);
    const rows = (
      await Promise.all(
        branches.map(branch => branchDirectoryMatch(branch, byFirm, filters))
      )
    ).filter(isBranchDirectoryRow);
    const sorted = [...rows].sort(compareBranchDirectoryRows);
    const { cursor, limit } = parsePagination(target);
    const { items, nextCursor } = paginate(
      sorted,
      { cursor: decodeCursor(cursor), limit },
      branchDirectoryKey
    );
    return { items, nextCursor, total: sorted.length };
  }
}

/**
 * Builds an enriched branch row when it matches public filters.
 * @param branch - Source branch row.
 * @param byFirm - Firm lookup keyed by id.
 * @param filters - Normalized public branch filters.
 * @returns Branch directory row, or null when filtered out.
 */
async function branchDirectoryMatch(
  branch: BranchRow,
  byFirm: ReadonlyMap<string, FirmRow>,
  filters: ReturnType<typeof parseBranchDirectoryFilters>
): Promise<BranchDirectoryRow | null> {
  const firm = byFirm.get(branch.firmId) ?? null;
  const linkedEmployments = await rowsByAttribute<EmploymentHistoryRow>(
    tables.EmploymentHistory,
    "branchId",
    branch.id
  );
  const currentAdvisorCount = currentBranchAdvisorCount(linkedEmployments);
  const sourceMetadata = branchSourceSummary(linkedEmployments);
  return branchMatchesFilters(
    branch,
    filters,
    firm,
    sourceMetadata.sourceTypes,
    currentAdvisorCount
  )
    ? branchDirectoryRow(branch, firm, currentAdvisorCount, sourceMetadata)
    : null;
}

/**
 * Narrows nullable branch rows.
 * @param row - Candidate branch directory row.
 * @returns True when the row is present.
 */
function isBranchDirectoryRow(
  row: BranchDirectoryRow | null
): row is BranchDirectoryRow {
  return row !== null;
}

/**
 * Counts distinct currently linked advisors for a branch.
 * @param employments - Employment rows already scoped to one branch.
 * @returns Current distinct advisor count.
 */
function currentBranchAdvisorCount(
  employments: ReadonlyArray<EmploymentHistoryRow>
): number {
  return new Set(
    employments
      .filter(employment => !employment.endDate)
      .map(employment => employment.advisorId)
  ).size;
}

/**
 * Summarizes employment source fields without exposing employment row ids.
 * @param employments - Employment rows already scoped to one branch.
 * @returns Distinct source types and references.
 */
function branchSourceSummary(
  employments: ReadonlyArray<EmploymentHistoryRow>
): BranchDirectoryRow["sourceMetadata"] {
  return {
    sourceTypes: distinctStrings(employments.map(row => row.sourceType)),
    sourceRefs: distinctStrings(employments.map(row => row.sourceRef)),
  };
}

/**
 * Builds the public branch explorer payload row.
 * @param branch - Source branch row.
 * @param firm - Resolved firm context, when present.
 * @param currentAdvisorCount - Distinct active advisor count for this branch.
 * @param sourceMetadata - Public source summary for linked employment rows.
 * @returns Branch directory row safe for anonymous clients.
 */
function branchDirectoryRow(
  branch: BranchRow,
  firm: FirmRow | null,
  currentAdvisorCount: number,
  sourceMetadata: BranchDirectoryRow["sourceMetadata"]
): BranchDirectoryRow {
  return {
    id: branch.id,
    firmId: branch.firmId,
    parentBranchId: branch.parentBranchId,
    level: branch.level,
    name: branch.name,
    buildingName: branch.buildingName,
    address: branch.address,
    city: branch.city,
    state: branch.state,
    country: branch.country,
    postalCode: branch.postalCode,
    displayName: branchDisplayName(branch),
    firmName: firm?.name ?? null,
    currentAdvisorCount,
    coverageStatus: branchCoverageStatus(firm, currentAdvisorCount),
    sourceMetadata,
  };
}

/**
 * Chooses a stable human branch label from available public fields.
 * @param branch - Branch row.
 * @returns Display label for the branch explorer.
 */
function branchDisplayName(branch: BranchRow): string {
  return (
    branch.name ||
    branch.buildingName ||
    [branch.city, branch.state].filter(Boolean).join(", ") ||
    branch.id
  );
}

/**
 * Classifies branch coverage without implying missing data means no offices.
 * @param firm - Resolved firm context, when present.
 * @param currentAdvisorCount - Distinct active advisor count for this branch.
 * @returns Public coverage state.
 */
function branchCoverageStatus(
  firm: FirmRow | null,
  currentAdvisorCount: number
): BranchDirectoryRow["coverageStatus"] {
  if (!firm) return "unavailable";
  return currentAdvisorCount > 0 ? "loaded" : "partial";
}

/**
 * Returns sorted unique non-empty string values.
 * @param values - Candidate strings.
 * @returns Stable unique values.
 */
function distinctStrings(
  values: ReadonlyArray<string | null | undefined>
): ReadonlyArray<string> {
  return [...new Set(values.filter(isNonEmptyString))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Narrows non-empty strings.
 * @param value - Candidate value.
 * @returns True when value is a non-empty string.
 */
function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
