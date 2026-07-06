import type {
  BranchCoverageRow,
  BranchRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmMergeAuditRow,
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
import { allRows, optionalAll } from "./resource-directory-tables.js";
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
import { branchGapGroup } from "./resource-branch-gap-groups.js";
import {
  branchCoverageByBranch,
  branchCoverageSourceMetadata,
  type BranchCoverageByBranch,
} from "./resource-branch-coverage-read-model.js";
import { branchSourceSummary } from "./resource-branch-source-labels.js";
import {
  currentBranchAdvisorCount,
  fallbackEmploymentsByBranch,
} from "./resource-directory-branch-employment.js";

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
   *
   * Deliberately reads the Firm table in full (a bounded scan of one
   * small dimension table — hundreds of rows — plus the tiny FirmAlias
   * overlay) rather than a `searchPageAndCount` indexed query: the
   * alias-merge canonicalization must see every Firm row to fold
   * duplicates, `total` counts the post-merge set, the `q` filter is a
   * case-insensitive substring over name/legalName (not expressible as
   * an indexed Harper condition), and the legacy (sortKey, id)
   * key-cursor sorts by lowercased name, which Harper's raw btree
   * collation cannot reproduce. The #721 full-scan concern was the
   * 13k-row Advisor / 90k-row EmploymentHistory tables — this endpoint
   * touches neither.
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
   *
   * Deliberately reads the small Team and Firm dimension tables in full
   * (bounded scans, hundreds of rows each) rather than a
   * `searchPageAndCount` indexed query: canonicalization needs every
   * Firm row for alias merges and every Team row for public-name
   * cleanup + identity dedupe (`total` counts the deduped set), the `q`
   * filter is a case-insensitive substring, and the legacy (sortKey,
   * id) key-cursor sorts by lowercased cleaned name. See the
   * `PublicFirms.get` note — the #721 concern was the large
   * Advisor/EmploymentHistory tables, which this endpoint never reads.
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
   *
   * Deliberately reads the Branch, Firm, and BranchCoverage tables in
   * full (bounded scans of three dimension tables) rather than a
   * `searchPageAndCount` indexed query: gap-group and coverage-status
   * filters are derived per row from the coverage read-model (not
   * stored columns), the legacy (sortKey, id) key-cursor sorts by a
   * composite lowercased firm/level/city key, and the employment
   * fallback below already goes through indexed per-branch lookups.
   * See the `PublicFirms.get` note for the shared rationale.
   * @param target - Request target carrying optional filters and pagination.
   * @returns Branch page, next cursor, and total row count.
   */
  async get(target?: RouteTarget): Promise<DirectoryPage<BranchDirectoryRow>> {
    const [branches, firms, branchCoverages] = await Promise.all([
      allRows<BranchRow>(tables.Branch),
      allRows<FirmRow>(tables.Firm),
      optionalAll<BranchCoverageRow>(tables.BranchCoverage),
    ]);
    const byFirm = new Map(firms.map(firm => [firm.id, firm]));
    const coverageByBranch = branchCoverageByBranch(branchCoverages);
    const employmentsByBranch =
      coverageByBranch.size === branches.length
        ? new Map<string, ReadonlyArray<EmploymentHistoryRow>>()
        : await fallbackEmploymentsByBranch(
            { EmploymentHistory: tables.EmploymentHistory },
            branches,
            await optionalAll<FirmMergeAuditRow>(tables.FirmMergeAudit)
          );
    const filters = parseBranchDirectoryFilters(target);
    const rows = matchingBranchDirectoryRows(
      branches,
      byFirm,
      coverageByBranch,
      employmentsByBranch,
      filters
    );
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
 * Enriches branch rows from firm-indexed employment rows so source metadata
 * stays consistent with the aggregate coverage resources.
 * @param branches - Branch rows to evaluate in source order.
 * @param byFirm - Firm lookup keyed by id.
 * @param coverageByBranch - Materialized branch coverage keyed by branch id.
 * @param employmentsByBranch - Employment rows keyed by branch id.
 * @param filters - Normalized public branch filters.
 * @returns Matching public branch rows in source order.
 */
function matchingBranchDirectoryRows(
  branches: ReadonlyArray<BranchRow>,
  byFirm: ReadonlyMap<string, FirmRow>,
  coverageByBranch: BranchCoverageByBranch,
  employmentsByBranch: ReadonlyMap<string, ReadonlyArray<EmploymentHistoryRow>>,
  filters: ReturnType<typeof parseBranchDirectoryFilters>
): ReadonlyArray<BranchDirectoryRow> {
  return branches
    .map(branch =>
      branchDirectoryMatch(
        branch,
        byFirm,
        coverageByBranch,
        employmentsByBranch,
        filters
      )
    )
    .filter(isBranchDirectoryRow);
}

/**
 * Builds an enriched branch row when it matches public filters.
 * @param branch - Source branch row.
 * @param byFirm - Firm lookup keyed by id.
 * @param coverageByBranch - Materialized branch coverage keyed by branch id.
 * @param employmentsByBranch - Employment rows keyed by branch id.
 * @param filters - Normalized public branch filters.
 * @returns Branch directory row, or null when filtered out.
 */
function branchDirectoryMatch(
  branch: BranchRow,
  byFirm: ReadonlyMap<string, FirmRow>,
  coverageByBranch: BranchCoverageByBranch,
  employmentsByBranch: ReadonlyMap<string, ReadonlyArray<EmploymentHistoryRow>>,
  filters: ReturnType<typeof parseBranchDirectoryFilters>
): BranchDirectoryRow | null {
  const firm = byFirm.get(branch.firmId) ?? null;
  const coverage = coverageByBranch.get(branch.id) ?? null;
  const linkedEmployments = coverage
    ? []
    : (employmentsByBranch.get(branch.id) ?? []);
  const currentAdvisorCount =
    coverage?.currentAdvisorCount ??
    currentBranchAdvisorCount(linkedEmployments);
  const sourceMetadata = coverage
    ? branchCoverageSourceMetadata(coverage)
    : branchSourceSummary(linkedEmployments);
  const gapGroup =
    coverage?.gapGroup ??
    branchGapGroup({ firm, currentAdvisorCount, sourceMetadata });
  return branchMatchesFilters(
    branch,
    filters,
    firm,
    sourceMetadata.sourceTypes,
    currentAdvisorCount,
    gapGroup
  )
    ? branchDirectoryRow(
        branch,
        firm,
        currentAdvisorCount,
        sourceMetadata,
        coverage
      )
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
 * Builds the public branch explorer payload row.
 * @param branch - Source branch row.
 * @param firm - Resolved firm context, when present.
 * @param currentAdvisorCount - Distinct active advisor count for this branch.
 * @param sourceMetadata - Public source summary for linked employment rows.
 * @param coverage - Materialized coverage row, when present.
 * @returns Branch directory row safe for anonymous clients.
 */
function branchDirectoryRow(
  branch: BranchRow,
  firm: FirmRow | null,
  currentAdvisorCount: number,
  sourceMetadata: BranchDirectoryRow["sourceMetadata"],
  coverage: BranchCoverageRow | null = null
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
    coverageStatus:
      coverage?.coverageStatus ??
      branchCoverageStatus(firm, currentAdvisorCount),
    gapGroup:
      coverage?.gapGroup ??
      branchGapGroup({ firm, currentAdvisorCount, sourceMetadata }),
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
