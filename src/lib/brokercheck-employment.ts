/**
 * BrokerCheck employment rows are sparse endpoint payloads.
 */
type BrokerRecord = Readonly<Record<string, unknown>>;

const EMPLOYMENT_MERGE_GAP_DAYS = 90;

/**
 * Converts BrokerCheck employment dates to ISO calendar dates.
 * @param value - Raw date value, usually MM/DD/YYYY.
 * @returns ISO date or null when BrokerCheck supplied an empty or invalid value.
 */
function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts.map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.getUTCFullYear() === yyyy &&
    d.getUTCMonth() === mm - 1 &&
    d.getUTCDate() === dd
    ? d.toISOString().slice(0, 10)
    : null;
}

/**
 * Parses one BrokerCheck employment row into loader fields.
 * @param emp - Raw BrokerCheck employment row.
 * @returns Normalized employment row used by the loader.
 */
export function parseEmployment(emp: BrokerRecord): BrokerRecord {
  return {
    _firmFinraId: String(emp.firmId ?? ""),
    _firmName: emp.firmName ?? "",
    _iaSecNumber: emp.iaSECNumber ?? null,
    _bdSecNumber: emp.bdSECNumber ?? null,
    _iaOnly: String(emp.iaOnly ?? "N").toUpperCase() === "Y",
    startDate: toIsoDate(asString(emp.registrationBeginDate)),
    endDate: toIsoDate(asString(emp.registrationEndDate)),
    _city: emp.city ?? null,
    _state: emp.state ?? null,
  };
}

/**
 * Reads a BrokerCheck field as a string when the API supplied one.
 * @param value - Raw BrokerCheck field value.
 * @returns String value, or null for absent/non-string fields.
 */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Collapses adjacent BrokerCheck BD/IA employment rows for the same firm.
 * @param rows - Parsed employment rows from current and historical sections.
 * @returns Deduplicated employment rows in first-seen firm order.
 */
export function dedupeEmployments(
  rows: readonly BrokerRecord[]
): readonly BrokerRecord[] {
  const groups = rows.reduce(
    groupEmployment,
    {} as Readonly<Record<string, readonly BrokerRecord[]>>
  );
  const order = [...new Set(rows.map(employmentKey))];
  return order.flatMap(key => mergeEmploymentBucket(groups[key] ?? []));
}

/**
 * Groups employment rows by firm identity while preserving first-seen order separately.
 * @param groups - Existing groups keyed by firm identity.
 * @param row - Employment row to append.
 * @returns A new grouped-employment object.
 */
function groupEmployment(
  groups: Readonly<Record<string, readonly BrokerRecord[]>>,
  row: BrokerRecord
): Readonly<Record<string, readonly BrokerRecord[]>> {
  const key = employmentKey(row);
  return { ...groups, [key]: [...(groups[key] ?? []), row] };
}

/**
 * Selects the firm identity used when collapsing BrokerCheck BD/IA rows.
 * @param row - Employment row to key.
 * @returns FINRA firm identifier, firm name, or an empty fallback.
 */
function employmentKey(row: BrokerRecord): string {
  return String(row._firmFinraId || row._firmName || "");
}

/**
 * Merges one firm's employment rows when BrokerCheck splits adjacent BD/IA registrations.
 * @param bucket - Employment rows for a single firm.
 * @returns Deduplicated employment rows ordered by start date.
 */
function mergeEmploymentBucket(
  bucket: readonly BrokerRecord[]
): readonly BrokerRecord[] {
  return [...bucket]
    .sort((a, b) =>
      String(a.startDate ?? "").localeCompare(String(b.startDate ?? ""))
    )
    .reduce(mergeEmploymentInto, [] as readonly BrokerRecord[]);
}

/**
 * Adds one employment row to an immutable merged bucket.
 * @param merged - Previously merged rows.
 * @param row - Next source employment row.
 * @returns Updated merged bucket.
 */
function mergeEmploymentInto(
  merged: readonly BrokerRecord[],
  row: BrokerRecord
): readonly BrokerRecord[] {
  const current = merged.at(-1);
  if (!current) return [{ ...row }];
  if (
    !withinMergeGap(String(current.endDate || ""), String(row.startDate || ""))
  )
    return [...merged, { ...row }];
  return [...merged.slice(0, -1), mergeEmploymentRows(current, row)];
}

/**
 * Combines adjacent BrokerCheck employment rows for the same firm.
 * @param current - Current merged row.
 * @param row - Adjacent row to fold into the current row.
 * @returns A merged row that keeps the widest date range and available metadata.
 */
function mergeEmploymentRows(
  current: BrokerRecord,
  row: BrokerRecord
): BrokerRecord {
  return {
    ...current,
    startDate: earlierDate(current.startDate, row.startDate),
    endDate: laterNullableDate(current.endDate, row.endDate),
    _iaOnly: Boolean(current._iaOnly) && Boolean(row._iaOnly),
    _iaSecNumber: current._iaSecNumber || row._iaSecNumber,
    _bdSecNumber: current._bdSecNumber || row._bdSecNumber,
    _city: current._city || row._city,
    _state: current._state || row._state,
  };
}

/**
 * Keeps the earliest populated ISO date.
 * @param left - First candidate date.
 * @param right - Second candidate date.
 * @returns Earliest populated date, or the only populated value.
 */
function earlierDate(left: unknown, right: unknown): unknown {
  if (left && right)
    return [String(left), String(right)].sort((a, b) => a.localeCompare(b))[0];
  return left ?? right;
}

/**
 * Keeps null for open-ended jobs, otherwise the latest populated ISO date.
 * @param left - First candidate end date.
 * @param right - Second candidate end date.
 * @returns Latest end date or null when either row is still open.
 */
function laterNullableDate(left: unknown, right: unknown): string | null {
  if (!left || !right) return null;
  return (
    [String(left), String(right)].sort((a, b) => a.localeCompare(b))[1] ?? null
  );
}

/**
 * Checks whether two rows are close enough for BrokerCheck's BD/IA split-row merge.
 * @param prevEnd - Previous row end date.
 * @param nextStart - Next row start date.
 * @returns Whether the gap is at most the merge threshold.
 */
function withinMergeGap(prevEnd: string, nextStart: string): boolean {
  if (!prevEnd) return true;
  if (!nextStart) return false;
  const a = Date.parse(`${prevEnd}T00:00:00Z`);
  const b = Date.parse(`${nextStart}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return (b - a) / 86_400_000 <= EMPLOYMENT_MERGE_GAP_DAYS;
}
