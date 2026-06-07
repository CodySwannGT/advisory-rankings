import type { CoverageQuery, GroupCountRow } from "./data-coverage-report.js";

export const FIRM_SOURCE_COVERAGE_METRICS = [
  "advisors",
  "branches",
  "firmAliases",
  "researchChecks",
  "sourceBackedFacts",
] as const;

/**
 *
 */
export type FirmSourceCoverageMetric =
  (typeof FIRM_SOURCE_COVERAGE_METRICS)[number];

/**
 *
 */
interface QueryResult<T> {
  readonly rows: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Compute source-lane metrics emitted by firm-source adapters.
 * @param query SQL reader.
 * @param safeRows Recoverable SQL query wrapper.
 * @returns Grouped firm-source coverage rows plus warnings.
 */
export async function firmSourceCoverage(
  query: CoverageQuery,
  safeRows: <T extends Readonly<Record<string, unknown>>>(
    query: CoverageQuery,
    sqlText: string
  ) => Promise<QueryResult<T>>
): Promise<
  Readonly<
    Record<
      "coverage",
      Readonly<Record<FirmSourceCoverageMetric, ReadonlyArray<GroupCountRow>>>
    > &
      Record<"warnings", ReadonlyArray<string>>
  >
> {
  const results = await Promise.all(
    FIRM_SOURCE_COVERAGE_METRICS.map(async metric => ({
      metric,
      result: await safeRows<GroupCountRow>(
        query,
        firmSourceCoverageSql(metric)
      ),
    }))
  );
  return {
    coverage: Object.fromEntries(
      results.map(({ metric, result }) => [metric, result.rows])
    ) as Readonly<
      Record<FirmSourceCoverageMetric, ReadonlyArray<GroupCountRow>>
    >,
    warnings: results.flatMap(({ result }) => result.warnings),
  };
}

const firmSourceCoverageSql = (metric: FirmSourceCoverageMetric): string => {
  if (metric === "advisors") {
    return "SELECT sourceType AS label, COUNT(DISTINCT advisorId) AS n FROM data.EmploymentHistory WHERE sourceType IS NOT NULL AND sourceType != '' GROUP BY sourceType ORDER BY n DESC LIMIT 20";
  }
  if (metric === "branches") {
    return "SELECT sourceType AS label, COUNT(DISTINCT branchId) AS n FROM data.EmploymentHistory WHERE sourceType IS NOT NULL AND sourceType != '' AND branchId IS NOT NULL AND branchId != '' GROUP BY sourceType ORDER BY n DESC LIMIT 20";
  }
  if (metric === "firmAliases") {
    return "SELECT sourceType AS label, COUNT(*) AS n FROM data.FirmAlias WHERE sourceType IS NOT NULL AND sourceType != '' AND sourceType != 'curated' GROUP BY sourceType ORDER BY n DESC LIMIT 20";
  }
  if (metric === "researchChecks") {
    return "SELECT sourceType AS label, COUNT(*) AS n FROM data.AdvisorResearchCheck WHERE sourceType IS NOT NULL AND sourceType != '' GROUP BY sourceType ORDER BY n DESC LIMIT 20";
  }
  return "SELECT targetTable AS label, COUNT(*) AS n FROM data.FieldAssertion GROUP BY targetTable ORDER BY n DESC LIMIT 20";
};
