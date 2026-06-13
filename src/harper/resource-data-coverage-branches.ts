import type { ResourceIndex } from "./resource-data.js";
import type {
  DataCoverageMetric,
  DataCoverageSection,
} from "./resource-data-coverage.js";

export const PUBLIC_BRANCHES_RESOURCE = "/PublicBranches";

/**
 * Builds public branch coverage metrics from branch and employment rows.
 * @param db Shared Harper resource index.
 * @returns Branch coverage section.
 */
export function branchCoverageSection(db: ResourceIndex): DataCoverageSection {
  const branchIdsWithCurrentAdvisors = new Set(
    db.employments
      .filter(row => row.branchId && !row.endDate)
      .map(row => row.branchId)
  );
  return {
    id: "branch-coverage",
    label: "Branch coverage",
    metrics: [
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
    ],
  };
}

/**
 *
 * @param id
 * @param label
 * @param value
 * @param source
 * @param limitation
 */
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
