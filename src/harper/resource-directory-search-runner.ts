/**
 * `/Search` query runner — extracted from `resource-directory-endpoints.ts`
 * to keep the endpoint module under the project's `max-lines` ceiling
 * and the Search resource's `get` method under
 * `max-lines-per-function`. See
 * `.claude/scratch/issue-721-architecture.md` §5.2 for the design
 * rationale (token index for advisor side, `starts_with` on `@indexed`
 * `name`/`legalName`/`normalizedAlias` for firm side, `starts_with` on
 * `Team.name` for team side).
 */
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type {
  SearchCounts,
  SearchKind,
  SearchResponse,
} from "./resource-directory-types.js";
import { canonicalizeForSearch } from "./resource-firm-canonicalization.js";
import { optionalAll, rowsByAttribute } from "./resource-directory-tables.js";
import { rankedSearchMatches } from "./resource-directory-sorting.js";
import {
  firmPrefixSearch,
  rowsByIds,
  teamPrefixSearch,
} from "./resource-directory-search-queries.js";
import { searchAdvisorsByTokens } from "./resource-advisor-token-query.js";
import { currentFirmNameByAdvisor } from "./resource-search.js";

/** Inputs needed to execute a global search request. */
export interface GlobalSearchInput {
  readonly norm: string;
  readonly kind: SearchKind;
  readonly cap: number;
}

/**
 * Runs the global navbar search across firms, advisors, and teams.
 * Each entity side flows through its own index-backed prefix path
 * (spike §0.1 Q2 — `starts_with` on `@indexed` String is a btree range
 * scan). Hydration is bounded by `cap`; the existing `scoreName`
 * scorer is preserved over the bounded hydrated set so result
 * ordering is unchanged from the user's perspective.
 *
 * NOTE: tier-1 substring (`name.includes(q)`) is dropped from the
 * advisor path. The token index supports prefix-on-token only (spike
 * §0.1 Q6 — `contains` is not index-backed); mid-token substring
 * search would require Plan B (prefix-permutation tokens) which is
 * out of scope for #721.
 * @param input - Normalized query, requested kind, and per-side cap.
 * @returns Ranked search response.
 */
export async function runGlobalSearch(
  input: GlobalSearchInput
): Promise<SearchResponse> {
  const { norm, kind, cap } = input;
  const needAdvisors = kind === "all" || kind === "advisor";
  const needFirms = kind === "all" || kind === "firm";
  const needTeams = kind === "all" || kind === "team";
  const [advisorIds, firmMatches, teamMatches, firmAliases] = await Promise.all(
    [
      needAdvisors
        ? searchAdvisorsByTokens(tables.AdvisorSearchIndex, norm).then(
            result => result.ids
          )
        : Promise.resolve<readonly string[]>([]),
      needFirms
        ? firmPrefixSearch(norm, cap)
        : Promise.resolve<readonly FirmRow[]>([]),
      needTeams
        ? teamPrefixSearch(norm, cap)
        : Promise.resolve<readonly TeamRow[]>([]),
      optionalAll<FirmAliasRow>(tables.FirmAlias),
    ]
  );
  const advisors = await rowsByIds<AdvisorRow>(
    tables.Advisor,
    advisorIds.slice(0, cap)
  );
  // Counts come from the index-backed query result sizes BEFORE the
  // hydration cap. The legacy `searchCounts(matches)` over the
  // scored-matches array would undercount the advisor side when more
  // than `cap` advisors matched the query (because only the first
  // `cap` get hydrated and scored).
  const counts = {
    advisors: advisorIds.length,
    firms: firmMatches.length,
    teams: teamMatches.length,
    total: advisorIds.length + firmMatches.length + teamMatches.length,
  };
  return buildSearchResponse({
    norm,
    kind,
    cap,
    advisors,
    firmMatches,
    teamMatches,
    firmAliases,
    counts,
  });
}

/**
 *
 */
interface BuildSearchResponseInput {
  readonly norm: string;
  readonly kind: SearchKind;
  readonly cap: number;
  readonly advisors: readonly AdvisorRow[];
  readonly firmMatches: readonly FirmRow[];
  readonly teamMatches: readonly TeamRow[];
  readonly firmAliases: readonly FirmAliasRow[];
  readonly counts: SearchCounts;
}

const buildSearchResponse = async (
  input: BuildSearchResponseInput
): Promise<SearchResponse> => {
  const { norm, kind, cap, advisors, firmMatches, teamMatches, firmAliases } =
    input;
  const rows = canonicalizeForSearch({
    firms: firmMatches,
    teams: teamMatches,
    employments: [],
    firmAliases,
  });
  const byFirm = new Map(rows.firms.map(firm => [firm.id, firm]));
  const matches = rankedSearchMatches({
    advisors,
    firms: rows.firms,
    teams: rows.teams,
    byFirm,
    currentFirmByAdvisor: new Map<string, EmploymentHistoryRow>(),
    norm,
  }).filter(match => kind === "all" || match.kind === kind);
  const displayed = matches.slice(0, cap);
  const displayedAdvisorIds = displayed
    .filter(match => match.kind === "advisor")
    .map(match => match.id);
  const subtitleByAdvisor = await resolveSearchAdvisorSubtitles({
    advisorIds: displayedAdvisorIds,
    searchFirms: rows.firms,
  });
  const advisorById = new Map(advisors.map(advisor => [advisor.id, advisor]));
  return {
    q: norm,
    kind,
    items: displayed.map(({ sortKey, ...row }) =>
      row.kind === "advisor"
        ? {
            ...row,
            sub: advisorSearchSubtitle(row.id, subtitleByAdvisor, advisorById),
          }
        : row
    ),
    counts: canonicalSearchCounts(input.counts, rows),
  };
};

/**
 * Recomputes counts after firm and team canonicalization collapses aliases.
 * @param counts - Raw search index counts.
 * @param rows - Canonicalized firm and team rows.
 * @returns Search response counts.
 */
function canonicalSearchCounts(
  counts: SearchCounts,
  rows: Pick<ReturnType<typeof canonicalizeForSearch>, "firms" | "teams">
): SearchCounts {
  return {
    ...counts,
    firms: rows.firms.length,
    teams: rows.teams.length,
    total: counts.advisors + rows.firms.length + rows.teams.length,
  };
}

/**
 * Resolves the display subtitle for a displayed advisor search row.
 * @param id - Displayed advisor id.
 * @param subtitleByAdvisor - Current-firm subtitles fetched for displayed rows.
 * @param advisorById - Hydrated advisor fallback rows.
 * @returns Current firm subtitle or career status fallback.
 */
function advisorSearchSubtitle(
  id: string,
  subtitleByAdvisor: ReadonlyMap<string, string>,
  advisorById: ReadonlyMap<string, AdvisorRow>
): string | null {
  return (
    subtitleByAdvisor.get(id) ?? (advisorById.get(id)?.careerStatus || null)
  );
}

/**
 * Inputs to {@link resolveSearchAdvisorSubtitles}.
 */
interface SubtitleResolutionInput {
  readonly advisorIds: readonly string[];
  /** Firms already hydrated for the search response (prefix matches). */
  readonly searchFirms: readonly FirmRow[];
}

/**
 * Resolves the current-firm display name for each displayed search
 * advisor without scanning the EmploymentHistory or Firm tables.
 *
 * The legacy `resolveDisplayedAdvisorFirms` helper assumed the caller
 * had already loaded ALL firms (the legacy Search ran an `allRows`
 * over `tables.Firm`); now that Search hydrates firms only when they
 * prefix-match the query, the advisor's CURRENT firm is usually
 * NOT in that prefix-match set. So:
 *
 *   1. Fetch each displayed advisor's employments via the indexed
 *      `advisorId` lookup.
 *   2. Hydrate the firm rows referenced by those employments via the
 *      indexed primary key.
 *   3. Build a complete `byFirm` map and resolve the subtitle.
 *
 * Every read here is index-backed; no table scans.
 * @param input - Displayed advisor ids and search-hydrated firms.
 * @returns Map of advisor id → current firm display name.
 */
async function resolveSearchAdvisorSubtitles(
  input: SubtitleResolutionInput
): Promise<ReadonlyMap<string, string>> {
  if (input.advisorIds.length === 0) return new Map<string, string>();
  const employmentsByAdvisor = await Promise.all(
    input.advisorIds.map(id =>
      rowsByAttribute<EmploymentHistoryRow>(
        tables.EmploymentHistory,
        "advisorId",
        id
      )
    )
  );
  const employments = employmentsByAdvisor.flat();
  const employmentFirmIds = [...new Set(employments.map(e => e.firmId))];
  const searchFirmIds = new Set(input.searchFirms.map(firm => firm.id));
  const missingFirmIds = employmentFirmIds.filter(id => !searchFirmIds.has(id));
  const extraFirms = await rowsByIds<FirmRow>(tables.Firm, missingFirmIds);
  const byFirm = new Map(
    [...input.searchFirms, ...extraFirms].map(firm => [firm.id, firm])
  );
  return currentFirmNameByAdvisor(employments, byFirm);
}
