import type { ResourceIndex } from "./resource-data.js";
import type {
  DataCoverageMetric,
  DataCoverageSection,
} from "./resource-data-coverage.js";
import type { BranchGapGroup } from "./resource-branch-gap-groups.js";
import { branchGapGroup } from "./resource-branch-gap-groups.js";

export const PUBLIC_BRANCHES_RESOURCE = "/PublicBranches";

/**
 * Builds public branch coverage metrics from branch and employment rows.
 * @param db Shared Harper resource index.
 * @returns Branch coverage section.
 */
export function branchCoverageSection(db: ResourceIndex): DataCoverageSection {
  return {
    id: "branch-coverage",
    label: "Branch coverage",
    metrics: branchCoverageMetrics(db),
  };
}

/**
 * Builds the metric list for the branch coverage section.
 * @param db Shared Harper resource index.
 * @returns Branch coverage metrics.
 */
function branchCoverageMetrics(
  db: ResourceIndex
): ReadonlyArray<DataCoverageMetric> {
  const knownBranchIds = new Set(db.branches.map(row => row.id));
  const knownFirmIds = new Set(db.firms.map(row => row.id));
  const branchIdsWithCurrentAdvisors = new Set(
    db.employments
      .filter(
        row => row.branchId && !row.endDate && knownBranchIds.has(row.branchId)
      )
      .map(row => row.branchId)
  );
  const gapCounts = branchGapCounts(db, knownFirmIds);
  return [
    branchMetric(
      "branches",
      "Branches",
      db.branches.length,
      "Branch",
      db.branches.length === 0
        ? "Branch rows are unavailable; this does not imply firms have no offices."
        : null
    ),
    branchMetric(
      "branches-with-current-advisors",
      "Branches with current advisors",
      branchIdsWithCurrentAdvisors.size,
      "EmploymentHistory.branchId",
      branchIdsWithCurrentAdvisors.size < db.branches.length
        ? "Some branch rows have partial advisor linkage."
        : null
    ),
    ...branchGapMetrics(gapCounts),
  ];
}

/**
 * Counts public branch rows by gap group.
 * @param db Shared Harper resource index.
 * @param knownFirmIds Firm ids present in the public firm table.
 * @returns Counts for every public gap group.
 */
function branchGapCounts(
  db: ResourceIndex,
  knownFirmIds: ReadonlySet<string>
): Record<BranchGapGroup, number> {
  return db.branches.reduce<Record<BranchGapGroup, number>>(
    (counts, branch) => {
      const linkedEmployments = db.employments.filter(
        row => row.branchId === branch.id
      );
      const group = branchGapGroup({
        firm: knownFirmIds.has(branch.firmId) ? { id: branch.firmId } : null,
        currentAdvisorCount: new Set(
          linkedEmployments
            .filter(row => !row.endDate)
            .map(row => row.advisorId)
        ).size,
        sourceMetadata: {
          sourceTypes: distinctStrings(
            linkedEmployments.map(row => row.sourceType)
          ),
          sourceLabels: [],
          sourceRefs: distinctStrings(
            linkedEmployments.map(row => row.sourceRef)
          ),
        },
      });
      return { ...counts, [group]: counts[group] + 1 };
    },
    {
      loaded: 0,
      partial: 0,
      unavailable: 0,
      "zero-advisor": 0,
      "missing-source": 0,
    }
  );
}

/**
 * Builds the group-count metrics for branch gap finder clients.
 * @param gapCounts Counts keyed by public branch gap group.
 * @returns Data coverage metrics for every branch gap group.
 */
function branchGapMetrics(
  gapCounts: Record<BranchGapGroup, number>
): ReadonlyArray<DataCoverageMetric> {
  return [
    branchMetric(
      "branch-gap-loaded",
      "Loaded branch rows",
      gapCounts.loaded,
      "Branch + EmploymentHistory.branchId",
      null
    ),
    branchMetric(
      "branch-gap-partial",
      "Partial branch rows",
      gapCounts.partial,
      "Branch + EmploymentHistory.branchId",
      gapCounts.partial > 0
        ? "Some branch rows need source or advisor linkage before they can be treated as loaded."
        : null
    ),
    branchMetric(
      "branch-gap-unavailable",
      "Unavailable branch rows",
      gapCounts.unavailable,
      "Branch.firmId",
      gapCounts.unavailable > 0
        ? "Some branch rows do not resolve to a public firm."
        : null
    ),
    branchMetric(
      "branch-gap-zero-advisor",
      "Zero-advisor branch rows",
      gapCounts["zero-advisor"],
      "EmploymentHistory.branchId",
      gapCounts["zero-advisor"] > 0
        ? "Some sourced branch rows have no current linked advisors."
        : null
    ),
    branchMetric(
      "branch-gap-missing-source",
      "Missing-source branch rows",
      gapCounts["missing-source"],
      "EmploymentHistory.sourceType",
      gapCounts["missing-source"] > 0
        ? "Some advisor-linked branch rows are missing public source labels."
        : null
    ),
  ];
}

/**
 * Returns sorted unique non-empty string values.
 * @param values Candidate values.
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
 * @param value Candidate value.
 * @returns True when value is a non-empty string.
 */
function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Creates one branch coverage metric bound to the public branch resource.
 * @param id - Stable metric identifier.
 * @param label - Human-readable metric label.
 * @param value - Numeric metric value.
 * @param source - Source table or field behind the metric.
 * @param limitation - Optional limitation copy for incomplete coverage.
 * @returns Data coverage metric.
 */
function branchMetric(
  id: string,
  label: string,
  value: number,
  source: string,
  limitation: string | null
): DataCoverageMetric {
  return {
    id,
    label,
    value,
    source,
    publicResource: PUBLIC_BRANCHES_RESOURCE,
    limitation,
  };
}
