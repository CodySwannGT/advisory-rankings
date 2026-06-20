/** Minimal JSON object used by Recruiting Market verification evidence. */
type JsonRecord = Readonly<Record<string, unknown>>;

const REQUIRED_MISSING_FIELD_STATUSES = [
  "missing-total-pct-t12",
  "missing-clawback-terms",
] as const;
const REQUIRED_BROWSER_STATUS_LABELS = [
  "TOTAL T-12 UNAVAILABLE",
  "CLAWBACK TERMS UNAVAILABLE",
] as const;

/** Browser evidence captured from one rendered `/recruiting` viewport. */
export interface RecruitingBrowserEvidence {
  readonly screenshot: string;
  readonly sourceStatusText: string;
  readonly summaryText: string;
  readonly tableCount: number;
  readonly viewport: "desktop" | "mobile";
}

/** Filtered API slice captured during replay. */
export interface RecruitingFilterEvidence {
  readonly label: string;
  readonly path: string;
  readonly recentMoveCount: number;
  readonly marketActivityCount: number;
}

/** Durable evidence for the Recruiting Market replay command. */
export interface RecruitingMarketVerificationEvidence {
  readonly browser: readonly RecruitingBrowserEvidence[];
  readonly capturedAt: string;
  readonly dataBaseUrl: string;
  readonly defaultResource: RecruitingResourceEvidence;
  readonly filters: readonly RecruitingFilterEvidence[];
  readonly localUrl: string;
}

/** Summary of one `/RecruitingMarket` payload. */
export interface RecruitingResourceEvidence {
  readonly firmMomentumCount: number;
  readonly marketActivityCount: number;
  readonly missingFieldStatuses: readonly string[];
  readonly recentMoveCount: number;
  readonly sampleMarkets: readonly string[];
  readonly sampleMoves: readonly JsonRecord[];
}

/**
 * Builds compact API evidence from a RecruitingMarket payload.
 * @param payload - Decoded `/RecruitingMarket` JSON response.
 * @returns Counts, required missing-field tags, and row samples.
 */
export function summarizeRecruitingMarketPayload(
  payload: unknown
): RecruitingResourceEvidence {
  const body = recordValue(payload);
  const recentMoves = arrayValue(body.recentMoves);
  const marketActivity = arrayValue(body.marketActivity);
  return {
    firmMomentumCount: arrayValue(body.firmMomentum).length,
    marketActivityCount: marketActivity.length,
    missingFieldStatuses: missingFieldStatuses(recentMoves),
    recentMoveCount: recentMoves.length,
    sampleMarkets: marketActivity
      .map(row => recordValue(row).market)
      .filter(isString)
      .slice(0, 5),
    sampleMoves: recentMoves
      .map(recordValue)
      .slice(0, 5)
      .map(move =>
        pickJson(move, [
          "id",
          "subject",
          "fromFirm",
          "toFirm",
          "moveDate",
          "location",
          "sourceStatus",
        ])
      ),
  };
}

/**
 * Throws when captured evidence no longer satisfies the replay criteria.
 * @param evidence - Captured browser and API evidence.
 */
export function assertRecruitingMarketVerification(
  evidence: RecruitingMarketVerificationEvidence
): void {
  const failures = [
    countFailure(
      "default recent moves",
      evidence.defaultResource.recentMoveCount,
      2
    ),
    countFailure(
      "default market activity rows",
      evidence.defaultResource.marketActivityCount,
      2
    ),
    missingStatusesFailure(evidence.defaultResource.missingFieldStatuses),
    ...evidence.filters.map(filter =>
      countFailure(`${filter.label} recent moves`, filter.recentMoveCount, 1)
    ),
    ...evidence.browser.flatMap(viewport => browserFailures(viewport)),
  ].filter(isString);

  if (failures.length > 0) {
    throw new Error(
      `Recruiting Market verification failed: ${failures.join("; ")}`
    );
  }
}

/**
 * Builds the preferred filtered resource paths from the default payload.
 * @param payload - Decoded default `/RecruitingMarket` JSON response.
 * @returns Stable non-empty filter paths for replay.
 */
export function recruitingMarketFilterPaths(
  payload: unknown
): readonly string[] {
  const firstMove = recordValue(
    arrayValue(recordValue(payload).recentMoves)[0]
  );
  const location = recordValue(firstMove.location);
  const state = location.state;
  const moveDate = firstMove.moveDate;
  return [
    isString(state)
      ? `/RecruitingMarket?state=${encodeURIComponent(state)}&limit=25`
      : "",
    isString(moveDate)
      ? `/RecruitingMarket?year=${encodeURIComponent(moveDate.slice(0, 4))}&limit=25`
      : "",
  ].filter(isString);
}

/**
 * Builds a route path equivalent to a resource filter path.
 * @param resourcePath - `/RecruitingMarket` path and query.
 * @returns `/recruiting` path using the same query string.
 */
export function recruitingRoutePath(resourcePath: string): string {
  const url = new URL(resourcePath, "https://verify.local");
  return `/recruiting${url.search}`;
}

/**
 * Builds a failed count message when a metric is below a minimum.
 * @param label - Human-readable metric.
 * @param actual - Observed count.
 * @param minimum - Required minimum.
 * @returns Failure string or empty string.
 */
function countFailure(label: string, actual: number, minimum: number): string {
  return actual >= minimum ? "" : `${label} ${actual} < ${minimum}`;
}

/**
 * Checks whether required missing-field statuses are present.
 * @param statuses - Missing-field source status tags.
 * @returns Failure string or empty string.
 */
function missingStatusesFailure(statuses: readonly string[]): string {
  const missing = REQUIRED_MISSING_FIELD_STATUSES.filter(
    status => !statuses.includes(status)
  );
  return missing.length ? `missing source statuses: ${missing.join(", ")}` : "";
}

/**
 * Checks one rendered viewport for the visible evidence the replay promises.
 * @param viewport - Browser capture evidence.
 * @returns Browser-level failures.
 */
function browserFailures(
  viewport: RecruitingBrowserEvidence
): readonly string[] {
  return [
    countFailure(
      `${viewport.viewport} recruiting tables`,
      viewport.tableCount,
      1
    ),
    /\bmoves?\b/i.test(viewport.summaryText)
      ? ""
      : `${viewport.viewport} summary does not include move count`,
    REQUIRED_BROWSER_STATUS_LABELS.every(status =>
      viewport.sourceStatusText.toUpperCase().includes(status)
    )
      ? ""
      : `${viewport.viewport} source statuses missing required labels`,
  ];
}

/**
 * Collects unique missing-field source statuses from recent moves.
 * @param moves - Recent move rows.
 * @returns Sorted missing-field status tags.
 */
function missingFieldStatuses(moves: readonly unknown[]): readonly string[] {
  return [
    ...new Set(
      moves
        .flatMap(move => arrayValue(recordValue(move).sourceStatus))
        .filter(isString)
        .filter(status => status.startsWith("missing-"))
    ),
  ].sort((left, right) => left.localeCompare(right));
}

/**
 * Picks selected fields from one JSON record.
 * @param record - Source record.
 * @param keys - Keys to preserve.
 * @returns Compact JSON record.
 */
function pickJson(record: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(
    keys
      .filter(key => key in record)
      .map(key => [key, record[key] ?? null] as const)
  );
}

/**
 * Narrows unknown values to non-empty strings.
 * @param value - Candidate value.
 * @returns Whether the candidate is a non-empty string.
 */
function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Narrows unknown values to JSON records.
 * @param value - Candidate value.
 * @returns Object record or an empty object.
 */
function recordValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

/**
 * Narrows unknown values to arrays.
 * @param value - Candidate value.
 * @returns Array value or an empty array.
 */
function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
