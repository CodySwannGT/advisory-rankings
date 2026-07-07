import type { BranchCoverageRow } from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";
import type {
  DataCoverageMetric,
  DataCoverageSection,
} from "./resource-data-coverage.js";
import { buildBranchCoverageRows } from "./resource-branch-coverage-read-model.js";
import type { BranchGapGroup } from "./resource-branch-gap-groups.js";

export const PUBLIC_BRANCHES_RESOURCE = "/PublicBranches";

/** Definition for one branch gap coverage metric. */
interface BranchGapMetricDefinition {
  readonly group: BranchGapGroup;
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly limitation: string | null;
}

const BRANCH_GAP_METRICS: readonly BranchGapMetricDefinition[] = [
  {
    group: "loaded",
    id: "branch-gap-loaded",
    label: "Loaded branch rows",
    source: "BranchCoverage.gapGroup",
    limitation: null,
  },
  {
    group: "partial",
    id: "branch-gap-partial",
    label: "Partial branch rows",
    source: "BranchCoverage.gapGroup",
    limitation:
      "Some branch rows need source or advisor linkage before they can be treated as loaded.",
  },
  {
    group: "unavailable",
    id: "branch-gap-unavailable",
    label: "Unavailable branch rows",
    source: "Branch.firmId",
    limitation: "Some branch rows do not resolve to a public firm.",
  },
  {
    group: "zero-advisor",
    id: "branch-gap-zero-advisor",
    label: "Zero-advisor branch rows",
    source: "BranchCoverage.currentAdvisorCount",
    limitation: "Some sourced branch rows have no current linked advisors.",
  },
  {
    group: "missing-source",
    id: "branch-gap-missing-source",
    label: "Missing-source branch rows",
    source: "BranchCoverage.sourceTypes",
    limitation:
      "Some advisor-linked branch rows are missing public source labels.",
  },
];

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
  const coverageRows = publicBranchCoverageRows(db);
  const branchIdsWithCurrentAdvisors = new Set(
    coverageRows
      .filter(row => row.currentAdvisorCount > 0)
      .map(row => row.branchId)
  );
  const gapCounts = branchGapCounts(coverageRows);
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
      "BranchCoverage.currentAdvisorCount",
      branchIdsWithCurrentAdvisors.size < db.branches.length
        ? "Some branch rows have partial advisor linkage."
        : null
    ),
    ...branchGapMetrics(gapCounts),
  ];
}

/**
 * Counts public branch rows by gap group.
 * @param coverageRows Public branch coverage rows.
 * @returns Counts for every public gap group.
 */
function branchGapCounts(
  coverageRows: ReadonlyArray<BranchCoverageRow>
): Record<BranchGapGroup, number> {
  return coverageRows.reduce<Record<BranchGapGroup, number>>(
    (counts, row) => ({ ...counts, [row.gapGroup]: counts[row.gapGroup] + 1 }),
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
 * Chooses materialized branch coverage rows when present, otherwise builds
 * them inside the aggregate-only DataCoverage resource.
 * @param db Shared Harper resource index.
 * @returns Public branch coverage rows.
 */
function publicBranchCoverageRows(
  db: ResourceIndex
): ReadonlyArray<BranchCoverageRow> {
  const fallbackRows = buildBranchCoverageRows({
    branches: db.branches,
    firms: db.firms,
    employments: db.employments,
  });
  if (db.branchCoverages.length === 0) return fallbackRows;
  const coverageByBranch = new Map(
    db.branchCoverages.map(row => [row.branchId, row])
  );
  return fallbackRows.map(row => coverageByBranch.get(row.branchId) ?? row);
}

/**
 * Builds the group-count metrics for branch gap finder clients.
 * @param gapCounts Counts keyed by public branch gap group.
 * @returns Data coverage metrics for every branch gap group.
 */
function branchGapMetrics(
  gapCounts: Record<BranchGapGroup, number>
): ReadonlyArray<DataCoverageMetric> {
  return BRANCH_GAP_METRICS.map(definition =>
    branchMetric(
      definition.id,
      definition.label,
      gapCounts[definition.group],
      definition.source,
      branchGapLimitation(gapCounts[definition.group], definition.limitation)
    )
  );
}

/**
 * Shows limitation copy only for non-empty branch gap buckets.
 * @param count - Gap bucket count.
 * @param message - Limitation message for non-empty buckets.
 * @returns Limitation copy or null.
 */
function branchGapLimitation(
  count: number,
  message: string | null
): string | null {
  return count > 0 ? message : null;
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
