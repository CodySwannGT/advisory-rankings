/**
 * BrokerCheck payload objects are sparse and vary by endpoint.
 */
export type BrokerRecord = Readonly<Record<string, unknown>>;

/**
 * Converts BrokerCheck date strings to ISO yyyy-mm-dd dates.
 * @param value - Raw date value from BrokerCheck.
 * @returns ISO date when the source value is parseable.
 */
export function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts.map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      d.getUTCFullYear() === yyyy &&
      d.getUTCMonth() === mm - 1 &&
      d.getUTCDate() === dd
    ) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * Title-cases BrokerCheck display-name fragments.
 * @param value - Raw name fragment.
 * @returns Title-cased text, or null for blank input.
 */
export function title(value?: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Narrows an unknown value to a plain BrokerCheck record.
 * @param value - Candidate payload value from BrokerCheck.
 * @returns Whether the value is a non-array object usable as a BrokerRecord.
 */
function isRecord(value: unknown): value is BrokerRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows an unknown value to a readonly BrokerCheck record array.
 * @param value - Candidate array payload value from BrokerCheck.
 * @returns Whether the value is an array of record-shaped entries.
 */
function isRecordArray(value: unknown): value is readonly BrokerRecord[] {
  return Array.isArray(value) && value.every(isRecord);
}

/**
 * Returns the value at `key` when present and a record, otherwise an empty record.
 * @param source - Parent BrokerCheck record.
 * @param key - Field whose nested record should be read.
 * @returns Nested record, or an empty fallback for absent or non-record values.
 */
export function recordField(source: BrokerRecord, key: string): BrokerRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

/**
 * Returns the value at `key` when present and a record array, otherwise an empty array.
 * @param source - Parent BrokerCheck record.
 * @param key - Field whose nested record array should be read.
 * @returns Nested record array, or an empty fallback when absent or non-array.
 */
export function recordArrayField(
  source: BrokerRecord,
  key: string
): readonly BrokerRecord[] {
  const value = source[key];
  return isRecordArray(value) ? value : [];
}

/**
 * Reads a BrokerCheck field as a string when the source supplied one.
 * @param value - Raw field value from BrokerCheck.
 * @returns String value, or null for absent or non-string fields.
 */
export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Reads a numeric BrokerCheck count field with a zero fallback.
 * @param value - Raw count value from BrokerCheck.
 * @returns Numeric value, or zero when the field is missing or not numeric.
 */
export function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
