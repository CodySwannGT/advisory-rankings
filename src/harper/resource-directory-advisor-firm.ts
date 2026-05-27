import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { AdvisorDirectoryFilters } from "./resource-directory-types.js";
import {
  canonicalizeForAdvisorsDirectory,
  canonicalizeForSearch,
} from "./resource-firm-canonicalization.js";
import { currentFirmNameByAdvisor } from "./resource-search.js";
import {
  advisorMatchesNonFirmFilters,
  firmFilterMatchesFirm,
} from "./resource-directory-filters.js";
import {
  allRows,
  optionalAll,
  rowsByAttribute,
} from "./resource-directory-tables.js";

/** Max indexed lookups issued concurrently in one batch. */
const FIRM_LOOKUP_BATCH = 25;

/**
 * Resolves the advisors matching a `firm` filter WITHOUT scanning the whole
 * Advisor or EmploymentHistory tables. Canonical firms whose id/name matches
 * the filter are resolved from the (bounded) Firm table, each matching firm's
 * current employees are fetched via the indexed `firmId` attribute, and only
 * those advisors are then loaded by id and run through the remaining
 * advisor-field filters (q/careerStatus/hasCrd).
 *
 * Documented divergence: matching is based on having a current (no `endDate`)
 * employment at a firm whose id/name matches the filter, rather than
 * re-deriving each advisor's single global "current" employment and matching
 * that. This intentionally avoids the full-table scan that previously caused
 * >30s backend time under load. In practice an advisor has one current
 * employment, so the observable result matches; the divergence only surfaces
 * for the rare case of overlapping open-ended employment rows.
 * @param filters - Parsed advisor directory filters (q/careerStatus/hasCrd).
 * @param firmFilter - Normalized non-empty `firm` filter value.
 * @returns Advisors currently employed at a matching firm, post-filtered.
 */
export async function advisorsMatchingFirm(
  filters: AdvisorDirectoryFilters,
  firmFilter: string
): Promise<ReadonlyArray<AdvisorRow>> {
  const canonical = canonicalizeForAdvisorsDirectory({
    firms: await allRows<FirmRow>(tables.Firm),
    employments: [],
    firmAliases: await optionalAll<FirmAliasRow>(tables.FirmAlias),
  });
  const matchingFirmIds = canonical.firms
    .filter(firm => firmFilterMatchesFirm(firmFilter, firm))
    .map(firm => firm.id);
  if (!matchingFirmIds.length) return [];
  const employments = await currentEmploymentsForFirms(matchingFirmIds);
  const matchingFirmIdSet = new Set(matchingFirmIds);
  const advisorIds = [
    ...new Set(
      employments
        .filter(
          employment =>
            matchingFirmIdSet.has(employment.firmId) && !employment.endDate
        )
        .map(employment => employment.advisorId)
    ),
  ];
  if (!advisorIds.length) return [];
  const advisors = await advisorsByIds(advisorIds);
  return advisors.filter(advisor =>
    advisorMatchesNonFirmFilters(advisor, filters)
  );
}

/**
 * Loads advisor rows for a bounded set of ids via the indexed primary key,
 * batching the lookups so a large firm cannot fan out into an unbounded
 * concurrent burst. Lookup failures are re-thrown with local context.
 * @param advisorIds - Advisor ids to load (already de-duplicated).
 * @returns The matching advisor rows.
 */
async function advisorsByIds(
  advisorIds: ReadonlyArray<string>
): Promise<ReadonlyArray<AdvisorRow>> {
  const batches = chunk(advisorIds);
  try {
    return await batches.reduce<Promise<ReadonlyArray<AdvisorRow>>>(
      async (accumulated, batch) => {
        const rows = await accumulated;
        const fetched = await Promise.all(
          batch.map(id => rowsByAttribute<AdvisorRow>(tables.Advisor, "id", id))
        );
        return [...rows, ...fetched.flat()];
      },
      Promise.resolve([])
    );
  } catch (error) {
    throw new Error("Failed to load advisors for firm filter", {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

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
  const batches = chunk(firmIds);
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

/**
 * Splits ids into fixed-size batches for bounded-concurrency lookups.
 * @param ids - Ids to batch.
 * @returns Batches of at most `FIRM_LOOKUP_BATCH` ids each.
 */
function chunk(
  ids: ReadonlyArray<string>
): ReadonlyArray<ReadonlyArray<string>> {
  return Array.from(
    { length: Math.ceil(ids.length / FIRM_LOOKUP_BATCH) },
    (_unused, batchIndex) =>
      ids.slice(
        batchIndex * FIRM_LOOKUP_BATCH,
        batchIndex * FIRM_LOOKUP_BATCH + FIRM_LOOKUP_BATCH
      )
  );
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
export async function resolveDisplayedAdvisorFirms(
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
