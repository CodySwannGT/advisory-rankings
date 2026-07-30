import type { GroupCountRow, SparseRow } from "./data-coverage-report.js";
import type { RecruitingGapEntry } from "./data-coverage-recruiting-gap.js";
import { coverageWarnings } from "./data-coverage-warnings.js";

/** Query rows plus recoverable warning messages. */
interface QueryResult<T> {
  readonly rows: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<string>;
}

/** Latest-date row returned by freshness queries. */
interface DateRow {
  readonly [key: string]: unknown;
  readonly latest: string | null;
}

/** Table-count warnings plus the by-table count map. */
interface TableCountsResult {
  readonly counts: Readonly<Record<string, number>>;
  readonly warnings: ReadonlyArray<string>;
}

/** Field completeness results plus recoverable warnings. */
interface FieldCoverageGroups {
  readonly completeness: Readonly<Record<string, ReadonlyArray<unknown>>>;
  readonly warnings: ReadonlyArray<string>;
}

/** Latest-date query outputs used by the freshness warning rules. */
interface FreshnessGroups {
  readonly articles: QueryResult<DateRow>;
  readonly firmSourceChecks: QueryResult<DateRow>;
  readonly transitions: QueryResult<DateRow>;
}

/** Firm-source coverage rows plus recoverable warnings. */
interface FirmSourceCoverageGroups {
  readonly coverage: Readonly<Record<string, ReadonlyArray<GroupCountRow>>>;
  readonly warnings: ReadonlyArray<string>;
}

/** Sparse advisor and firm query outputs. */
interface SparseCoverageGroups {
  readonly advisors: QueryResult<SparseRow>;
  readonly firms: QueryResult<SparseRow>;
}

/** Inputs used to build data coverage warnings. */
interface DataCoverageWarningInput {
  readonly categories: QueryResult<GroupCountRow>;
  readonly counts: TableCountsResult;
  readonly fields: FieldCoverageGroups;
  readonly freshness: FreshnessGroups;
  readonly firmSources: FirmSourceCoverageGroups;
  readonly recruiting: QueryResult<GroupCountRow>;
  readonly recruitingGap: QueryResult<RecruitingGapEntry>;
  readonly sources: QueryResult<GroupCountRow>;
  readonly sparse: SparseCoverageGroups;
}

/**
 * Builds warnings for sparse or stale data coverage slices.
 * @param input - Aggregated coverage query outputs.
 * @returns Human-readable data coverage warnings.
 */
export function dataCoverageWarnings(
  input: DataCoverageWarningInput
): ReadonlyArray<string> {
  return coverageWarnings({
    articles: input.freshness.articles,
    categories: input.categories,
    counts: input.counts,
    fields: input.fields,
    firmSourceChecks: input.freshness.firmSourceChecks,
    firmSources: input.firmSources,
    recruiting: input.recruiting,
    recruitingGap: input.recruitingGap,
    sources: input.sources,
    sparseAdvisors: input.sparse.advisors,
    sparseFirms: input.sparse.firms,
    transitions: input.freshness.transitions,
  });
}
