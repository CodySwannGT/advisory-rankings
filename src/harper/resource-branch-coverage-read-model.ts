import type {
  BranchCoverageRow,
  BranchRow,
  EmploymentHistoryRow,
  FirmRow,
} from "../types/harper-schema.js";
import { branchGapGroup } from "./resource-branch-gap-groups.js";
import { publicBranchSourceLabel } from "./resource-branch-source-labels.js";
import type { BranchSourceSummary } from "./resource-directory-types.js";

/** Branch coverage rows keyed by branch id. */
export type BranchCoverageByBranch = ReadonlyMap<string, BranchCoverageRow>;

/** Input rows needed to build branch coverage. */
interface BranchCoverageBuildInput {
  readonly branches: ReadonlyArray<BranchRow>;
  readonly firms: ReadonlyArray<Pick<FirmRow, "id">>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
}

/**
 * Builds materialized public branch coverage rows from durable branch and
 * employment data. This runs in data-prep/backfill paths, not hot requests.
 * @param input - Branch, firm, and employment rows.
 * @param input.branches - Public branch rows to project.
 * @param input.firms - Public firm rows used to resolve branch firms.
 * @param input.employments - Employment rows linked to branch ids.
 * @param builtAt - Timestamp recorded on generated coverage rows.
 * @returns One coverage row for each branch.
 */
export function buildBranchCoverageRows(
  input: BranchCoverageBuildInput,
  builtAt = new Date().toISOString()
): ReadonlyArray<BranchCoverageRow> {
  const knownFirmIds = new Set(input.firms.map(firm => firm.id));
  const employmentsByBranch = groupEmploymentsByBranch(input.employments);
  return input.branches.map(branch => {
    const linkedEmployments = employmentsByBranch.get(branch.id) ?? [];
    const firm = knownFirmIds.has(branch.firmId) ? { id: branch.firmId } : null;
    const currentAdvisorCount = currentBranchAdvisorCount(linkedEmployments);
    const sourceMetadata = branchCoverageSourceSummary(linkedEmployments);
    const gapGroup = branchGapGroup({
      firm,
      currentAdvisorCount,
      sourceMetadata,
    });
    return {
      id: branch.id,
      branchId: branch.id,
      firmId: branch.firmId,
      currentAdvisorCount,
      coverageStatus: firm
        ? currentAdvisorCount > 0
          ? "loaded"
          : "partial"
        : "unavailable",
      gapGroup,
      sourceTypes: sourceMetadata.sourceTypes,
      sourceLabels: sourceMetadata.sourceLabels,
      builtAt,
    };
  });
}

/**
 * Indexes materialized branch coverage rows by branch id.
 * @param rows - Branch coverage rows.
 * @returns Coverage rows keyed by branch id.
 */
export function branchCoverageByBranch(
  rows: ReadonlyArray<BranchCoverageRow>
): BranchCoverageByBranch {
  return new Map(rows.map(row => [row.branchId, row]));
}

/**
 * Converts a materialized coverage row into the source summary shape used by
 * public branch rows and filters.
 * @param row - Materialized branch coverage row.
 * @returns Public source metadata summary.
 */
export function branchCoverageSourceMetadata(
  row: BranchCoverageRow
): BranchSourceSummary {
  return {
    sourceTypes: row.sourceTypes ?? [],
    sourceLabels:
      row.sourceLabels ??
      (row.sourceTypes ?? []).map(sourceType =>
        publicBranchSourceLabel(sourceType)
      ),
    sourceRefs: [],
  };
}

/**
 * Groups employment rows by branch id.
 * @param employments - Employment rows with optional branch ids.
 * @returns Employment rows keyed by branch id.
 */
function groupEmploymentsByBranch(
  employments: ReadonlyArray<EmploymentHistoryRow>
): ReadonlyMap<string, ReadonlyArray<EmploymentHistoryRow>> {
  return new Map(
    employments.reduce<
      ReadonlyArray<readonly [string, ReadonlyArray<EmploymentHistoryRow>]>
    >((entries, employment) => {
      if (!employment.branchId) return entries;
      const existing = entries.find(
        ([branchId]) => branchId === employment.branchId
      );
      if (!existing) return [...entries, [employment.branchId, [employment]]];
      return entries.map(([branchId, rows]) =>
        branchId === employment.branchId
          ? [branchId, [...rows, employment]]
          : [branchId, rows]
      );
    }, [])
  );
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
 * Summarizes source fields for a materialized public coverage row.
 * @param employments - Employment rows already scoped to one branch.
 * @returns Public source summary.
 */
function branchCoverageSourceSummary(
  employments: ReadonlyArray<EmploymentHistoryRow>
): BranchSourceSummary {
  const sourceTypes = distinctStrings(employments.map(row => row.sourceType));
  return {
    sourceTypes,
    sourceLabels: sourceTypes.map(publicBranchSourceLabel),
    sourceRefs: [],
  };
}

/**
 * Returns sorted unique non-empty string values.
 * @param values - Candidate values.
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
