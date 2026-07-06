import {
  dealEconomicsStatusCount,
  recruitingValidationReport,
} from "./recruiting-depth-report.js";

const RECRUITING_DEPTH_THRESHOLDS = {
  minMoves: 25,
  minFirmMomentumRows: 8,
  minMarketActivityRows: 10,
  minSourceCoveragePercent: 1,
  minMissingFieldTags: 1,
  minStateSlices: 2,
  minFirmSlices: 4,
  minDirectionSlices: 2,
} as const;

/** Loose JSON object used for compact evidence summaries. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** Facts needed to build compact recruiting depth evidence. */
interface RecruitingCompactSummaryFacts {
  readonly filterSlices: JsonRecord;
  readonly firmMomentumCount: number;
  readonly marketActivityCount: number;
  readonly missingAumCount: number;
  readonly missingDealEconomicsStatusCount: number;
  readonly missingFieldTags: ReadonlyArray<string>;
  readonly moveCount: number;
  readonly recentMoves: ReadonlyArray<unknown>;
  readonly sourceBackedCount: number;
  readonly sourceStatusTags: ReadonlyArray<string>;
  readonly summary: JsonRecord;
}

/** Input slices before compact recruiting depth counts are derived. */
interface RecruitingCompactSummaryInput {
  readonly filterSlices: JsonRecord;
  readonly firmMomentum: ReadonlyArray<unknown>;
  readonly marketActivity: ReadonlyArray<unknown>;
  readonly missingAumCount: number;
  readonly missingDealEconomicsStatusCount: number;
  readonly missingFieldTags: ReadonlyArray<string>;
  readonly moveCount: number;
  readonly recentMoves: ReadonlyArray<unknown>;
  readonly sourceBackedCount: number;
  readonly sourceStatusTags: ReadonlyArray<string>;
  readonly summary: JsonRecord;
}

/**
 * Builds the recruiting-resource baseline summary.
 * @param body - Decoded `/RecruitingMarket` JSON object.
 * @returns Compact recruiting depth evidence.
 */
export function summarizeRecruitingResourcePayload(
  body: JsonRecord
): JsonRecord {
  const summary = recordValue(body.summary);
  const recentMoves = arrayValue(body.recentMoves);
  const sourceCoverage = recordValue(body.sourceCoverage);
  const marketActivity = arrayValue(body.marketActivity);
  const firmMomentum = arrayValue(body.firmMomentum);
  const sourceStatusTags = uniqueStrings(
    recentMoves.flatMap(move => arrayValue(recordValue(move).sourceStatus))
  );
  const missingFieldTags = sourceStatusTags.filter(tag =>
    tag.startsWith("missing-")
  );
  const fallbackSourceBackedCount = recentMoves.filter(move =>
    hasStatus(move, "source-backed")
  ).length;
  const moveCount = numericValue(sourceCoverage.moveCount, recentMoves.length);
  const sourceBackedCount = numericValue(
    sourceCoverage.sourceBackedCount,
    fallbackSourceBackedCount
  );
  const missingAumCount = numericValue(
    sourceCoverage.missingAumCount,
    countMovesWithStatus(recentMoves, "missing-aum")
  );
  const missingDealEconomicsStatusCount = dealEconomicsStatusCount(
    sourceCoverage,
    recentMoves
  );
  const facts = buildRecruitingCompactSummaryFacts({
    filterSlices: recruitingFilterSlices(recentMoves),
    firmMomentum,
    marketActivity,
    missingAumCount,
    missingDealEconomicsStatusCount,
    missingFieldTags,
    moveCount,
    recentMoves,
    sourceBackedCount,
    sourceStatusTags,
    summary,
  });
  const compactSummary = recruitingCompactSummary(facts);
  return {
    ...compactSummary,
    validationReport: recruitingResourceValidationReport(facts),
  };
}

/**
 * Adds derived collection counts to compact recruiting summary facts.
 * @param input - Summary facts with full collection slices.
 * @returns Facts ready for compact summary and validation output.
 */
function buildRecruitingCompactSummaryFacts(
  input: RecruitingCompactSummaryInput
): RecruitingCompactSummaryFacts {
  return {
    ...input,
    firmMomentumCount: input.firmMomentum.length,
    marketActivityCount: input.marketActivity.length,
  };
}

/**
 * Builds the validation section from captured recruiting summary facts.
 * @param facts - Captured counts, tags, slices, and samples.
 * @returns Validation report for recruiting depth thresholds.
 */
function recruitingResourceValidationReport(
  facts: RecruitingCompactSummaryFacts
): JsonRecord {
  return recruitingValidationReport({
    moveCount: facts.moveCount,
    marketActivityCount: facts.marketActivityCount,
    sourceBackedCount: facts.sourceBackedCount,
    missingAumCount: facts.missingAumCount,
    missingDealEconomicsStatusCount: facts.missingDealEconomicsStatusCount,
    directionSliceCount: arrayValue(facts.filterSlices.directions).length,
    minimums: RECRUITING_DEPTH_THRESHOLDS,
  });
}

/**
 * Builds compact recruiting depth evidence from captured facts.
 * @param facts - Captured counts, tags, slices, and samples.
 * @returns Compact recruiting depth evidence.
 */
function recruitingCompactSummary(
  facts: RecruitingCompactSummaryFacts
): JsonRecord {
  return {
    summary: facts.summary,
    recentMoveCount: facts.moveCount,
    marketActivityCount: facts.marketActivityCount,
    firmMomentumCount: facts.firmMomentumCount,
    sourceBackedCount: facts.sourceBackedCount,
    sourceCoveragePercent: percent(facts.sourceBackedCount, facts.moveCount),
    knownAumCount: Math.max(facts.moveCount - facts.missingAumCount, 0),
    missingAumCount: facts.missingAumCount,
    missingDealEconomicsStatusCount: facts.missingDealEconomicsStatusCount,
    sourceStatusTags: facts.sourceStatusTags,
    missingFieldTags: facts.missingFieldTags,
    filterSlices: facts.filterSlices,
    thresholds: RECRUITING_DEPTH_THRESHOLDS,
    sampleRecentMoves: sampleRecords(facts.recentMoves, [
      "id",
      "subject",
      "fromFirm",
      "toFirm",
      "sourceStatus",
      "provenance",
    ]),
  };
}

/**
 * Validates that the recruiting market payload has enough public source depth
 * to be useful as an end-to-end smoke signal.
 * @param payload - Decoded `/RecruitingMarket?limit=100` JSON response.
 * @returns A compact summary of the threshold evidence.
 */
export function validateRecruitingMarketDepth(payload: unknown): JsonRecord {
  const summary = summarizeRecruitingResourcePayload(recordValue(payload));
  const failures = recruitingDepthFailures(summary);
  if (failures.length > 0) {
    throw new Error(
      `RecruitingMarket depth check failed: ${failures.join("; ")}`
    );
  }
  return summary;
}

/**
 * Builds meaningful filter dimensions represented by recent moves.
 * @param recentMoves - Public recruiting move rows.
 * @returns State, firm, and direction slices.
 */
function recruitingFilterSlices(recentMoves: readonly unknown[]): JsonRecord {
  return {
    states: uniqueStrings(
      recentMoves.map(move => recordValue(recordValue(move).location).state)
    ),
    firmIds: uniqueStrings(
      recentMoves.flatMap(move => {
        const record = recordValue(move);
        return [recordValue(record.fromFirm).id, recordValue(record.toFirm).id];
      })
    ),
    directions: uniqueStrings(
      recentMoves.flatMap(move => moveDirections(recordValue(move)))
    ),
  };
}

/**
 * Lists threshold failures for a recruiting summary.
 * @param summary - Output from `summarizeRecruitingResourcePayload`.
 * @returns Human-readable failure fragments.
 */
function recruitingDepthFailures(summary: JsonRecord): readonly string[] {
  const slices = recordValue(summary.filterSlices);
  return [
    thresholdFailure(
      "moves",
      summary.recentMoveCount,
      RECRUITING_DEPTH_THRESHOLDS.minMoves
    ),
    thresholdFailure(
      "firm momentum rows",
      summary.firmMomentumCount,
      RECRUITING_DEPTH_THRESHOLDS.minFirmMomentumRows
    ),
    thresholdFailure(
      "market activity rows",
      summary.marketActivityCount,
      RECRUITING_DEPTH_THRESHOLDS.minMarketActivityRows
    ),
    thresholdFailure(
      "source coverage percent",
      summary.sourceCoveragePercent,
      RECRUITING_DEPTH_THRESHOLDS.minSourceCoveragePercent
    ),
    thresholdFailure(
      "missing-field tags",
      arrayValue(summary.missingFieldTags).length,
      RECRUITING_DEPTH_THRESHOLDS.minMissingFieldTags
    ),
    thresholdFailure(
      "state filter slices",
      arrayValue(slices.states).length,
      RECRUITING_DEPTH_THRESHOLDS.minStateSlices
    ),
    thresholdFailure(
      "firm filter slices",
      arrayValue(slices.firmIds).length,
      RECRUITING_DEPTH_THRESHOLDS.minFirmSlices
    ),
    thresholdFailure(
      "direction filter slices",
      arrayValue(slices.directions).length,
      RECRUITING_DEPTH_THRESHOLDS.minDirectionSlices
    ),
  ].filter((failure): failure is string => Boolean(failure));
}

/**
 * Formats one failed minimum-threshold check.
 * @param label - Human-readable metric name.
 * @param actual - Observed value.
 * @param expected - Required minimum value.
 * @returns Failure text, or null when the threshold passed.
 */
function thresholdFailure(
  label: string,
  actual: unknown,
  expected: number
): string | null {
  const value = Number(actual);
  if (Number.isFinite(value) && value >= expected) return null;
  return `${label} ${Number.isFinite(value) ? value : "missing"} < ${expected}`;
}

/**
 * Infers which direction filters can return a move.
 * @param move - Public recruiting move record.
 * @returns Direction slices represented by the move.
 */
function moveDirections(move: JsonRecord): readonly string[] {
  return [
    Object.keys(recordValue(move.toFirm)).length > 0 ? "inbound" : "",
    Object.keys(recordValue(move.fromFirm)).length > 0 ? "outbound" : "",
  ].filter(isString);
}

/**
 * Counts rows carrying a specific source-status token.
 * @param moves - Public move rows.
 * @param status - Source-status token.
 * @returns Number of matching moves.
 */
function countMovesWithStatus(
  moves: readonly unknown[],
  status: string
): number {
  return moves.filter(move => hasStatus(move, status)).length;
}

/**
 * Checks whether a move carries a status token.
 * @param move - Public move row.
 * @param status - Source-status token.
 * @returns True when the row includes the token.
 */
function hasStatus(move: unknown, status: string): boolean {
  return arrayValue(recordValue(move).sourceStatus).includes(status);
}

/**
 * Samples up to three objects and keeps only selected fields.
 * @param values - Candidate response rows.
 * @param keys - Keys to keep in each sampled row.
 * @returns Sample records suitable for durable evidence.
 */
function sampleRecords(
  values: readonly unknown[],
  keys: readonly string[]
): readonly JsonRecord[] {
  return values
    .map(recordValue)
    .filter(record => Object.keys(record).length > 0)
    .slice(0, 3)
    .map(record => pickJson(record, keys));
}

/**
 * Picks known JSON fields from one record.
 * @param record - Source record.
 * @param keys - Field names to retain.
 * @returns A compact record containing only requested keys.
 */
function pickJson(record: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(
    keys
      .filter(key => key in record)
      .map(key => [key, record[key] ?? null] as const)
  );
}

/**
 * Builds a stable unique string list from loosely typed values.
 * @param values - Candidate string values.
 * @returns Sorted non-empty strings.
 */
function uniqueStrings(values: readonly unknown[]): readonly string[] {
  return [...new Set(values.filter(isString))].sort((left, right) =>
    left.localeCompare(right)
  );
}

/**
 * Computes a rounded percentage with a zero-safe denominator.
 * @param numerator - Count of matching rows.
 * @param denominator - Total row count.
 * @returns Percentage rounded to two decimal places.
 */
function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
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
