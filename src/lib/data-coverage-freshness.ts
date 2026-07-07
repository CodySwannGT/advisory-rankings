import type { CoverageQuery } from "./data-coverage-report.js";

/** Latest-date row returned by Harper SQL freshness queries. */
interface DateRow {
  readonly [key: string]: unknown;
  readonly latest: string | null;
}

/** Query rows plus recoverable warning messages. */
interface QueryResult<T> {
  readonly rows: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<string>;
}

/** Freshness query result with latest-date rows. */
type FreshnessQueryResult = QueryResult<DateRow>;

/**
 * Reads latest-date inputs for the coverage freshness section.
 * @param query SQL reader.
 * @returns Article, transition, and firm-source freshness query results.
 */
export function coverageFreshnessResults(
  query: CoverageQuery
): Promise<
  readonly [FreshnessQueryResult, FreshnessQueryResult, FreshnessQueryResult]
> {
  return Promise.all([
    latestDate(query, "SELECT MAX(publishedDate) AS latest FROM data.Article"),
    latestDate(
      query,
      "SELECT MAX(moveDate) AS latest FROM data.TransitionEvent"
    ),
    latestDate(
      query,
      "SELECT MAX(checkedAt) AS latest FROM data.AdvisorResearchCheck"
    ),
  ]);
}

const latestDate = (
  query: CoverageQuery,
  sqlText: string
): Promise<FreshnessQueryResult> => safeRows<DateRow>(query, sqlText);

/**
 * Run one SQL query and capture recoverable failures as report warnings.
 * @param query SQL reader.
 * @param sqlText SQL text to execute.
 * @returns Rows plus warnings.
 */
async function safeRows<T extends Readonly<Record<string, unknown>>>(
  query: CoverageQuery,
  sqlText: string
): Promise<QueryResult<T>> {
  try {
    return { rows: await query<T>(sqlText), warnings: [] };
  } catch (error) {
    return {
      rows: [],
      warnings: [String(error).split("\n")[0] ?? "query failed"],
    };
  }
}
