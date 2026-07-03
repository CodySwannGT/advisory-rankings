import {
  unextractedRecruitingWarnings,
  type RecruitingGapEntry,
} from "./data-coverage-recruiting-gap.js";

/** Query result shape needed for direct warning aggregation. */
interface WarningResult {
  readonly warnings: ReadonlyArray<string>;
}

/** Recruiting gap result includes rows used for derived warnings. */
interface RecruitingWarningResult extends WarningResult {
  readonly rows: ReadonlyArray<RecruitingGapEntry>;
}

/** Query result bundle collected while building a coverage report. */
interface CoverageWarningInputs {
  readonly articles: WarningResult;
  readonly categories: WarningResult;
  readonly counts: WarningResult;
  readonly fields: WarningResult;
  readonly firmSourceChecks: WarningResult;
  readonly firmSources: WarningResult;
  readonly recruiting: WarningResult;
  readonly recruitingGap: RecruitingWarningResult;
  readonly sources: WarningResult;
  readonly sparseAdvisors: WarningResult;
  readonly sparseFirms: WarningResult;
  readonly transitions: WarningResult;
}

/**
 * Combines direct query warnings with recruiting extraction gap warnings.
 * @param input - Query results collected while building the coverage report.
 * @returns Ordered warning messages for the report.
 */
export function coverageWarnings(
  input: CoverageWarningInputs
): readonly string[] {
  return [
    ...input.counts.warnings,
    ...input.sources.warnings,
    ...input.categories.warnings,
    ...input.firmSources.warnings,
    ...input.fields.warnings,
    ...input.sparseAdvisors.warnings,
    ...input.sparseFirms.warnings,
    ...input.recruiting.warnings,
    ...input.recruitingGap.warnings,
    ...unextractedRecruitingWarnings(input.recruitingGap.rows),
    ...input.articles.warnings,
    ...input.transitions.warnings,
    ...input.firmSourceChecks.warnings,
  ];
}
