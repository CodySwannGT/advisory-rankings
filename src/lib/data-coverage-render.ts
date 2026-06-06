import type {
  CoverageReport,
  GroupCountRow,
  SparseRow,
} from "./data-coverage-report.js";

const WARN_AFTER_DAYS = 45;

/**
 * Render a coverage report for operator console output.
 * @param report Aggregated report to render.
 * @param target Human-readable Harper target.
 * @returns Multiline report text.
 */
export function renderDataCoverageReport(
  report: CoverageReport,
  target: string
): string {
  return [
    `[data-coverage] target: ${target}`,
    `[data-coverage] generatedAt: ${report.generatedAt}`,
    "",
    "Table counts",
    ...Object.entries(report.counts).map(
      ([table, count]) => `  ${table.padEnd(34)} ${count}`
    ),
    groupLines("Source assertion counts", report.sourceCounts),
    groupLines("Article source counts", report.articleCategories),
    firmSourceCoverageLines(report),
    completenessLines(report.completeness),
    sparseLines("Sparse advisor rankings", report.sparseAdvisors),
    sparseLines("Sparse firm rankings", report.sparseFirms),
    groupLines("Recruiting coverage", report.recruitingCoverage),
    warningLines(report),
  ].join("\n");
}

const groupLines = (
  title: string,
  rows: ReadonlyArray<GroupCountRow>
): string =>
  [
    "",
    title,
    ...rows.map(
      row => `  ${String(row.label ?? "unknown").padEnd(34)} ${row.n}`
    ),
  ].join("\n");

const firmSourceCoverageLines = (report: CoverageReport): string =>
  [
    "",
    "Firm-source adapter coverage",
    groupLines("  Advisors by source", report.firmSourceCoverage.advisors),
    groupLines("  Branches by source", report.firmSourceCoverage.branches),
    groupLines(
      "  Firm aliases by source",
      report.firmSourceCoverage.firmAliases
    ),
    groupLines(
      "  Research checks by source",
      report.firmSourceCoverage.researchChecks
    ),
    groupLines(
      "  Source-backed facts by target",
      report.firmSourceCoverage.sourceBackedFacts
    ),
  ].join("\n");

const sparseLines = (title: string, rows: ReadonlyArray<SparseRow>): string =>
  [
    "",
    title,
    ...rows
      .filter(row => row.missing > 0)
      .map(
        row =>
          `  ${String(row.label ?? row.id).padEnd(34)} missing=${row.missing}`
      ),
  ].join("\n");

const completenessLines = (sections: CoverageReport["completeness"]): string =>
  [
    "",
    "Core field completeness",
    ...Object.entries(sections).flatMap(([table, fields]) =>
      fields.map(
        field =>
          `  ${`${table}.${field.field}`.padEnd(34)} ${field.filled}/${field.total} (${field.pct}%)`
      )
    ),
  ].join("\n");

const warningLines = (report: CoverageReport): string => {
  const warnings = [
    staleWarning("articles", report.freshness.articles),
    staleWarning("transitions", report.freshness.transitions),
    staleWarning("firm source checks", report.freshness.firmSourceChecks),
    ...report.warnings,
  ].filter((warning): warning is string => Boolean(warning));
  return [
    "",
    "Freshness warnings",
    ...(warnings.length ? warnings.map(warning => `  ${warning}`) : ["  none"]),
  ].join("\n");
};

const staleWarning = (label: string, value: string | null): string | null => {
  if (!value) return `${label}: no dated rows`;
  const days = Math.floor(
    (Date.now() - new Date(`${value}T00:00:00Z`).getTime()) / 86_400_000
  );
  return days > WARN_AFTER_DAYS
    ? `${label}: latest row is ${days} days old`
    : null;
};
