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
import { currentFirmNameByAdvisor, searchCounts } from "./resource-search.js";
import {
  canonicalizeForAdvisorsDirectory,
  canonicalizeForFirmsDirectory,
  canonicalizeForSearch,
  canonicalizeForTeamsDirectory,
} from "./resource-firm-canonicalization.js";
import {
  advisorMatchesNonFirmFilters,
  firmFilterMatchesFirm,
  firmMatchesFilters,
  parseAdvisorDirectoryFilters,
  parseFirmDirectoryFilters,
  parseSearchKind,
  parseTeamDirectoryFilters,
  teamMatchesFilters,
  queryValue,
} from "./resource-directory-filters.js";
import {
  allRows,
  optionalAll,
  rowsByAttribute,
} from "./resource-directory-tables.js";
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
    // Load only the bounded tables. The largest table — EmploymentHistory
    // (~50k+ rows) — is NOT scanned here; scanning it (plus all advisors) on
    // every request was the root cause of >30s backend time under the smoke
    // gate's concurrent page load. Employment is needed ONLY when a `firm`
    // filter is active, and is then resolved via indexed `firmId` lookups.
    const [advisors, firms, firmAliases] = await Promise.all([
      allRows<AdvisorRow>(tables.Advisor),
      allRows<FirmRow>(tables.Firm),
      optionalAll<FirmAliasRow>(tables.FirmAlias),
    ]);
    const rows = canonicalizeForAdvisorsDirectory({
      firms,
      employments: [],
      firmAliases,
    });
    const filters = parseAdvisorDirectoryFilters(target);
    // Apply the advisor-field-only filters (q/careerStatus/hasCrd) up front,
    // without any employment data.
    const candidates = advisors.filter(advisor =>
      advisorMatchesNonFirmFilters(advisor, filters)
    );
    const matched = filters.firm
      ? await filterCandidatesByFirm(candidates, rows.firms, filters.firm)
      : candidates;
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

/**
 * Narrows advisor candidates to those with a CURRENT employment at a firm
 * matching the `firm` filter, without scanning the whole `EmploymentHistory`
 * table. Canonical firms whose id/name matches the filter are resolved first,
 * then each matching firm's current employments are fetched via the indexed
 * `firmId` attribute (in parallel) and reduced to the set of advisor IDs that
 * are currently employed there.
 *
 * Documented divergence: matching is based on having a current (no `endDate`)
 * employment at a firm whose id/name matches the filter, rather than
 * re-deriving each advisor's single global "current" employment and matching
 * that. This intentionally avoids the full-table scan that previously caused
 * >30s backend time under load. In practice an advisor has one current
 * employment, so the observable result matches; the divergence only surfaces
 * for the rare case of overlapping open-ended employment rows.
 * @param candidates - Advisors already passing the non-firm filters.
 * @param firms - Canonical firm rows for the request.
 * @param firmFilter - Normalized non-empty `firm` filter value.
 * @returns Candidates currently employed at a matching firm.
 */
async function filterCandidatesByFirm(
  candidates: ReadonlyArray<AdvisorRow>,
  firms: ReadonlyArray<FirmRow>,
  firmFilter: string
): Promise<ReadonlyArray<AdvisorRow>> {
  if (!candidates.length) return [];
  const matchingFirmIds = firms
    .filter(firm => firmFilterMatchesFirm(firmFilter, firm))
    .map(firm => firm.id);
  if (!matchingFirmIds.length) return [];
  const employments = await currentEmploymentsForFirms(matchingFirmIds);
  const matchingFirmIdSet = new Set(matchingFirmIds);
  // Keep only CURRENT rows (no endDate) at a matching firm. The `firmId`
  // guard re-applies the index condition defensively in case the runtime
  // returns extra rows.
  const advisorIds = new Set(
    employments
      .filter(
        employment =>
          matchingFirmIdSet.has(employment.firmId) && !employment.endDate
      )
      .map(employment => employment.advisorId)
  );
  return candidates.filter(advisor => advisorIds.has(advisor.id));
}

/** Max indexed firmId lookups issued concurrently in one batch. */
const FIRM_LOOKUP_BATCH = 25;

/**
 * Fetches employment rows for the given firm IDs via indexed `firmId`
 * lookups, bounding concurrency so a broad `firm` filter (matching many
 * firms) cannot fan out into an unbounded burst of simultaneous queries.
 * Lookup failures are re-thrown with local context.
 * @param firmIds - Canonical firm IDs whose employments to fetch.
 * @returns Flattened employment rows across all requested firms.
 */
async function currentEmploymentsForFirms(
  firmIds: ReadonlyArray<string>
): Promise<ReadonlyArray<EmploymentHistoryRow>> {
  const batches = Array.from(
    { length: Math.ceil(firmIds.length / FIRM_LOOKUP_BATCH) },
    (_unused, batchIndex) =>
      firmIds.slice(
        batchIndex * FIRM_LOOKUP_BATCH,
        batchIndex * FIRM_LOOKUP_BATCH + FIRM_LOOKUP_BATCH
      )
  );
  try {
    return await batches.reduce<Promise<ReadonlyArray<EmploymentHistoryRow>>>(
      async (accumulated, batch) => {
        const rows = await accumulated;
        const fetched = await Promise.all(
          batch.map(firmId =>
            rowsByAttribute<EmploymentHistoryRow>(
              tables.EmploymentHistory,
              "firmId",
              firmId
            )
          )
        );
        return [...rows, ...fetched.flat()];
      },
      Promise.resolve([])
    );
  } catch (error) {
    throw new Error("Failed to resolve advisor firm filter", {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
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

/**
 * Resolves current-firm subtitles for the displayed advisor slice using
 * targeted indexed `EmploymentHistory` lookups instead of a full-table scan.
 * For each advisor id it queries `EmploymentHistory` by the `@indexed`
 * `advisorId` attribute in parallel, canonicalizes just those rows against
 * the already-loaded firms/teams/firmAliases, and resolves each advisor's
 * current firm name via {@link currentFirmNameByAdvisor}.
 * @param advisorIds - IDs of the advisors in the displayed result slice.
 * @param firms - Firm rows already loaded for the request.
 * @param teams - Team rows already loaded for the request.
 * @param firmAliases - Firm-alias rows already loaded for the request.
 * @param byFirm - Canonical firm lookup keyed by firm ID.
 * @returns Map of advisor ID to resolved current firm name (advisors with no
 *   current employment or an unresolved firm are omitted).
 */
async function resolveDisplayedAdvisorFirms(
  advisorIds: ReadonlyArray<string>,
  firms: ReadonlyArray<FirmRow>,
  teams: ReadonlyArray<TeamRow>,
  firmAliases: ReadonlyArray<FirmAliasRow>,
  byFirm: ReadonlyMap<string, FirmRow>
): Promise<ReadonlyMap<string, string>> {
  if (!advisorIds.length) return new Map<string, string>();
  const fetched = await Promise.all(
    advisorIds.map(id =>
      rowsByAttribute<EmploymentHistoryRow>(
        tables.EmploymentHistory,
        "advisorId",
        id
      )
    )
  );
  const employments = fetched.flat();
  // Canonicalize the small employment set so firm-ID alias rewrites match
  // the canonical `byFirm` keys produced for the rest of the response.
  const canonical = canonicalizeForSearch({
    firms,
    teams,
    employments,
    firmAliases,
  });
  return currentFirmNameByAdvisor(canonical.employments, byFirm);
}
