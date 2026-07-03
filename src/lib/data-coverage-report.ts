import {
  firmSourceCoverage,
  type FirmSourceCoverageMetric,
} from "./data-coverage-firm-source.js";
import {
  detectUnextractedRecruiting,
  type RecruitingGapEntry,
} from "./data-coverage-recruiting-gap.js";
import { coverageWarnings } from "./data-coverage-warnings.js";

export type { RecruitingGapEntry } from "./data-coverage-recruiting-gap.js";

/**
 *
 */
interface CountRow {
  readonly [key: string]: unknown;
  readonly n: number;
}

/**
 *
 */
interface DateRow {
  readonly [key: string]: unknown;
  readonly latest: string | null;
}

/**
 *
 */
export interface GroupCountRow {
  readonly [key: string]: unknown;
  readonly label: string | null;
  readonly n: number;
}

/**
 *
 */
export interface SparseRow {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly label: string | null;
  readonly missing: number;
}

/**
 *
 */
interface FieldCoverage {
  readonly field: string;
  readonly filled: number;
  readonly total: number;
  readonly pct: number;
}

/**
 *
 */
export interface CoverageReport {
  readonly generatedAt: string;
  readonly counts: Readonly<Record<TableName, number>>;
  readonly sourceCounts: ReadonlyArray<GroupCountRow>;
  readonly articleCategories: ReadonlyArray<GroupCountRow>;
  readonly firmSourceCoverage: Readonly<
    Record<FirmSourceCoverageMetric, ReadonlyArray<GroupCountRow>>
  >;
  readonly completeness: Readonly<Record<string, ReadonlyArray<FieldCoverage>>>;
  readonly sparseAdvisors: ReadonlyArray<SparseRow>;
  readonly sparseFirms: ReadonlyArray<SparseRow>;
  readonly recruitingCoverage: ReadonlyArray<GroupCountRow>;
  readonly unextractedRecruitingArticles: ReadonlyArray<RecruitingGapEntry>;
  readonly freshness: Readonly<
    Record<"articles" | "transitions" | "firmSourceChecks", string | null>
  >;
  readonly warnings: ReadonlyArray<string>;
}

/**
 *
 */
interface QueryResult<T> {
  readonly rows: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<string>;
}

/**
 *
 */
type TableName = (typeof TABLES)[number];

/**
 *
 */
export type CoverageQuery = <T extends Readonly<Record<string, unknown>>>(
  query: string
) => Promise<ReadonlyArray<T>>;

const TABLES = [
  "Advisor",
  "Firm",
  "FirmAlias",
  "Branch",
  "Team",
  "TeamMembership",
  "Designation",
  "Article",
  "TransitionEvent",
  "ArticleTransitionEventMention",
  "FieldAssertion",
  "EmploymentHistory",
  "Disclosure",
  "AdvisorResearchCheck",
] as const;

const CORE_FIELDS = {
  Advisor: ["legalName", "firstName", "lastName", "finraCrd"],
  Firm: ["name", "channel"],
  Article: ["headline", "url", "publishedDate", "category"],
} as const;

/** Builds a data coverage report from a Harper SQL query function. */
interface DataCoverageReporter {
  /**
   * Build the report.
   * @param query SQL reader for local operations or Fabric proxy operations.
   * @returns Aggregated data coverage report.
   */
  (query: CoverageQuery): Promise<CoverageReport>;
}

/**
 * Build a data coverage report from a Harper SQL query function.
 * @param query SQL reader for local operations or Fabric proxy operations.
 * @returns Aggregated data coverage report.
 */
export const buildDataCoverageReport: DataCoverageReporter = async query => {
  const counts = await tableCounts(query);
  const sources = await safeRows<GroupCountRow>(query, sourceCountSql());
  const categories = await safeRows<GroupCountRow>(query, articleCategorySql());
  const firmSources = await firmSourceCoverage(query, safeRows);
  const fields = await completeness(query);
  const sparseAdvisors = await safeRows<SparseRow>(query, sparseAdvisorSql());
  const sparseFirms = await safeRows<SparseRow>(query, sparseFirmSql());
  const recruiting = await recruitingCoverage(query);
  const recruitingGap = await detectUnextractedRecruiting(query);
  const articles = await latestDate(
    query,
    "SELECT MAX(publishedDate) AS latest FROM data.Article"
  );
  const transitions = await latestDate(
    query,
    "SELECT MAX(moveDate) AS latest FROM data.TransitionEvent"
  );
  const firmSourceChecks = await latestDate(
    query,
    "SELECT MAX(checkedAt) AS latest FROM data.AdvisorResearchCheck"
  );
  return {
    generatedAt: new Date().toISOString(),
    counts: counts.counts,
    sourceCounts: sources.rows,
    articleCategories: categories.rows,
    firmSourceCoverage: firmSources.coverage,
    completeness: fields.completeness,
    sparseAdvisors: sparseAdvisors.rows,
    sparseFirms: sparseFirms.rows,
    recruitingCoverage: recruiting.rows,
    unextractedRecruitingArticles: recruitingGap.rows,
    freshness: freshnessReport(articles, transitions, firmSourceChecks),
    warnings: coverageWarnings({
      articles,
      categories,
      counts,
      fields,
      firmSourceChecks,
      firmSources,
      recruiting,
      recruitingGap,
      sources,
      sparseAdvisors,
      sparseFirms,
      transitions,
    }),
  };
};

/**
 * Summarizes latest-date query results for the coverage report.
 * @param articles Article freshness result.
 * @param transitions Transition freshness result.
 * @param firmSourceChecks Firm-source freshness result.
 * @returns Report freshness fields.
 */
function freshnessReport(
  articles: QueryResult<DateRow>,
  transitions: QueryResult<DateRow>,
  firmSourceChecks: QueryResult<DateRow>
): CoverageReport["freshness"] {
  return {
    articles: articles.rows[0]?.latest ?? null,
    transitions: transitions.rows[0]?.latest ?? null,
    firmSourceChecks: firmSourceChecks.rows[0]?.latest ?? null,
  };
}

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

/**
 * Count rows in each core data-depth table.
 * @param query SQL reader.
 * @returns Counts plus warnings.
 */
async function tableCounts(query: CoverageQuery) {
  const results = await TABLES.reduce<
    Promise<
      ReadonlyArray<
        Readonly<Record<"table", TableName>> &
          Readonly<Record<"result", QueryResult<CountRow>>>
      >
    >
  >(
    async (previous, table) => [
      ...(await previous),
      { table, result: await safeRows<CountRow>(query, countSql(table)) },
    ],
    Promise.resolve([])
  );
  return {
    counts: Object.fromEntries(
      results.map(({ table, result }) => [table, countValue(result.rows)])
    ) as Readonly<Record<TableName, number>>,
    warnings: results.flatMap(({ result }) => result.warnings),
  };
}

/**
 * Compute completeness for core table fields.
 * @param query SQL reader.
 * @returns Field coverage plus warnings.
 */
async function completeness(query: CoverageQuery) {
  const sections = await Object.entries(CORE_FIELDS).reduce<
    Promise<
      ReadonlyArray<
        Readonly<Record<"table", string>> &
          Readonly<Record<"fields", ReadonlyArray<FieldCoverage>>> &
          Readonly<Record<"warnings", ReadonlyArray<string>>>
      >
    >
  >(
    async (previous, [table, fields]) => [
      ...(await previous),
      await fieldCompleteness(query, table, fields),
    ],
    Promise.resolve([])
  );
  return {
    completeness: Object.fromEntries(
      sections.map(section => [section.table, section.fields])
    ) as Readonly<Record<string, ReadonlyArray<FieldCoverage>>>,
    warnings: sections.flatMap(section => section.warnings),
  };
}

/**
 * Compute completeness for one table's configured fields.
 * @param query SQL reader.
 * @param table Table name.
 * @param fields Field names to inspect.
 * @returns Field coverage section.
 */
async function fieldCompleteness(
  query: CoverageQuery,
  table: string,
  fields: ReadonlyArray<string>
) {
  const totalResult = await safeRows<CountRow>(query, countSql(table));
  const total = countValue(totalResult.rows);
  const fieldResults = await fields.reduce<
    Promise<
      ReadonlyArray<
        FieldCoverage & Readonly<Record<"warnings", ReadonlyArray<string>>>
      >
    >
  >(async (previous, field) => {
    const filledResult = await safeRows<CountRow>(
      query,
      filledSql(table, field)
    );
    const filled = countValue(filledResult.rows);
    return [
      ...(await previous),
      {
        field,
        filled,
        total,
        pct: pct(filled, total),
        warnings: filledResult.warnings,
      },
    ];
  }, Promise.resolve([]));
  return {
    table,
    fields: fieldResults.map(({ warnings: _warnings, ...field }) => field),
    warnings: [
      ...totalResult.warnings,
      ...fieldResults.flatMap(result => result.warnings),
    ],
  };
}

/**
 * Compute recruiting evidence counts without relying on UNION support.
 * @param query SQL reader.
 * @returns Recruiting coverage rows plus warnings.
 */
async function recruitingCoverage(
  query: CoverageQuery
): Promise<QueryResult<GroupCountRow>> {
  const specs = [
    ["transition_events", countSql("TransitionEvent")],
    ["article_transition_mentions", countSql("ArticleTransitionEventMention")],
    [
      "transition_field_assertions",
      "SELECT COUNT(*) AS n FROM data.FieldAssertion WHERE targetTable = 'TransitionEvent'",
    ],
  ] as const;
  const results = await specs.reduce<
    Promise<
      ReadonlyArray<
        Readonly<Record<"label", string>> &
          Readonly<Record<"result", QueryResult<CountRow>>>
      >
    >
  >(
    async (previous, [label, sqlText]) => [
      ...(await previous),
      { label, result: await safeRows<CountRow>(query, sqlText) },
    ],
    Promise.resolve([])
  );
  return {
    rows: results.map(({ label, result }) => ({
      label,
      n: countValue(result.rows),
    })),
    warnings: results.flatMap(({ result }) => result.warnings),
  };
}

const countSql = (table: string): string =>
  `SELECT COUNT(*) AS n FROM data.${table}`;

const filledSql = (table: string, field: string): string =>
  `SELECT COUNT(*) AS n FROM data.${table} WHERE ${field} IS NOT NULL AND ${field} != ''`;

const countValue = (rows: ReadonlyArray<CountRow>): number =>
  Number(rows[0]?.n ?? 0);

const latestDate = (
  query: CoverageQuery,
  sqlText: string
): Promise<QueryResult<DateRow>> => safeRows<DateRow>(query, sqlText);

const pct = (value: number, total: number): number =>
  total === 0 ? 0 : Math.round((value / total) * 1000) / 10;

const sourceCountSql = (): string =>
  "SELECT targetTable AS label, COUNT(*) AS n FROM data.FieldAssertion GROUP BY targetTable ORDER BY n DESC LIMIT 12";

const articleCategorySql = (): string =>
  "SELECT category AS label, COUNT(*) AS n FROM data.Article GROUP BY category ORDER BY n DESC LIMIT 12";

const sparseAdvisorSql = (): string =>
  "SELECT id, COALESCE(legalName, id) AS label, (CASE WHEN firstName IS NULL OR firstName = '' THEN 1 ELSE 0 END + CASE WHEN lastName IS NULL OR lastName = '' THEN 1 ELSE 0 END + CASE WHEN finraCrd IS NULL OR finraCrd = '' THEN 1 ELSE 0 END + CASE WHEN headshotUrl IS NULL OR headshotUrl = '' THEN 1 ELSE 0 END) AS missing FROM data.Advisor ORDER BY missing DESC, label LIMIT 10";

const sparseFirmSql = (): string =>
  "SELECT id, COALESCE(name, id) AS label, (CASE WHEN channel IS NULL OR channel = '' THEN 1 ELSE 0 END + CASE WHEN logoUrl IS NULL OR logoUrl = '' THEN 1 ELSE 0 END + CASE WHEN website IS NULL OR website = '' THEN 1 ELSE 0 END) AS missing FROM data.Firm ORDER BY missing DESC, label LIMIT 10";
