/** Loose JSON object used for compact evidence summaries. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** Counts and slices needed to build recruiting validation rows. */
interface RecruitingValidationReportInput {
  readonly moveCount: number;
  readonly marketActivityCount: number;
  readonly sourceBackedCount: number;
  readonly missingAumCount: number;
  readonly missingDealEconomicsStatusCount: number;
  readonly directionSliceCount: number;
  readonly minimums: RecruitingValidationMinimums;
}

/** Minimum thresholds used in the recruiting validation report. */
interface RecruitingValidationMinimums {
  readonly minMoves: number;
  readonly minMarketActivityRows: number;
  readonly minDirectionSlices: number;
}

/** One pass/fail validation row. */
interface ValidationCheck {
  readonly id: string;
  readonly label: string;
  readonly actual: number;
  readonly expectedMinimum: number;
  readonly passed: boolean;
}

/**
 * Builds explicit pass/fail rows for operator review of recruiting depth.
 * @param input - Counts and slices derived from the RecruitingMarket payload.
 * @returns Named checks plus pass/fail totals.
 */
export function recruitingValidationReport(
  input: RecruitingValidationReportInput
): JsonRecord {
  const knownAumCount = Math.max(input.moveCount - input.missingAumCount, 0);
  const checks = [
    validationCheck(
      "move-depth",
      "Move depth",
      input.moveCount,
      input.minimums.minMoves
    ),
    validationCheck(
      "market-depth",
      "Market depth",
      input.marketActivityCount,
      input.minimums.minMarketActivityRows
    ),
    validationCheck(
      "directional-slices",
      "Directional slices",
      input.directionSliceCount,
      input.minimums.minDirectionSlices
    ),
    validationCheck(
      "source-backed-rows",
      "Source-backed rows",
      input.sourceBackedCount,
      1
    ),
    validationCheck("known-aum-rows", "Known AUM rows", knownAumCount, 1),
    validationCheck(
      "unknown-aum-rows",
      "Unknown AUM rows",
      input.missingAumCount,
      1
    ),
    validationCheck(
      "missing-deal-economics-statuses",
      "Missing deal-economics statuses",
      input.missingDealEconomicsStatusCount,
      1
    ),
  ];
  const passCount = checks.filter(check => check.passed).length;
  return {
    passCount,
    failCount: checks.length - passCount,
    checks,
  };
}

/**
 * Counts missing deal-economics statuses from resource coverage or move rows.
 * @param sourceCoverage - Optional `/RecruitingMarket` sourceCoverage rollup.
 * @param recentMoves - Fallback sampled moves from the same payload.
 * @returns Count of rows carrying deal-economics missing status tags.
 */
export function dealEconomicsStatusCount(
  sourceCoverage: JsonRecord,
  recentMoves: readonly unknown[]
): number {
  const statusCounts = arrayValue(sourceCoverage.statusCounts);
  if (statusCounts.length > 0) {
    return statusCounts
      .map(recordValue)
      .filter(statusCount =>
        isDealEconomicsStatus(String(statusCount.status ?? ""))
      )
      .reduce(
        (total, statusCount) => total + numericValue(statusCount.count, 0),
        0
      );
  }
  return recentMoves.filter(move =>
    arrayValue(recordValue(move).sourceStatus).some(
      status => isString(status) && isDealEconomicsStatus(status)
    )
  ).length;
}

/**
 * Builds one threshold check row.
 * @param id - Stable machine-readable check id.
 * @param label - Human-readable check label.
 * @param actual - Observed count.
 * @param minimum - Required minimum count.
 * @returns Pass/fail row with actual and expected counts.
 */
function validationCheck(
  id: string,
  label: string,
  actual: number,
  minimum: number
): ValidationCheck {
  return {
    id,
    label,
    actual,
    expectedMinimum: minimum,
    passed: actual >= minimum,
  };
}

/**
 * Identifies source-status tokens that describe missing deal economics.
 * @param status - Source-status token.
 * @returns True when the status is a deal-economics gap.
 */
function isDealEconomicsStatus(status: string): boolean {
  return (
    status === "missing-deal-terms" ||
    status === "missing-upfront-pct-t12" ||
    status === "missing-total-pct-t12" ||
    status === "missing-producer-tier" ||
    status === "missing-backend-metrics" ||
    status === "missing-clawback-terms"
  );
}

/**
 * Reads a numeric field with a fallback.
 * @param value - Candidate value.
 * @param fallback - Fallback when the candidate is not numeric.
 * @returns Finite numeric value.
 */
function numericValue(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * Narrows unknown values to non-empty strings.
 * @param value - Candidate value.
 * @returns True when the value is a non-empty string.
 */
function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Narrows an unknown value to an object record.
 * @param value - Candidate JSON value.
 * @returns Object record or an empty object for non-record values.
 */
function recordValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

/**
 * Narrows an unknown value to an array.
 * @param value - Candidate JSON value.
 * @returns Array value or an empty array for non-arrays.
 */
function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
