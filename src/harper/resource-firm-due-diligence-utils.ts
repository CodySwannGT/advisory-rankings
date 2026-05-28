import type { HarperDate } from "../types/harper-schema.js";
import type {
  BrokerCheckSource,
  FreshnessNote,
  RankingAppearance,
} from "./resource-firm-due-diligence-types.js";

const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SOURCE_URL = "https://brokercheck.finra.org/";

/**
 * Builds the FreshnessNote payload modules attach to indicate source recency, falling back to an
 * `unavailable` note when no date is loaded.
 * @param date Source timestamp, or null/empty when not loaded.
 * @param fallback Human-readable explanation used when `date` is missing.
 * @returns The freshness note.
 */
export function freshnessNote(
  date: HarperDate | string | null,
  fallback: string
): FreshnessNote {
  return date
    ? { status: "loaded", asOf: date, note: "Source timestamp loaded." }
    : {
        status: "unavailable",
        asOf: null,
        note: fallback,
      };
}

/**
 * Builds a comparator that sorts rows by a HarperDate field in descending order using lexicographic
 * comparison (safe for ISO date strings).
 * @param field Field name to sort by.
 * @returns A comparator function over rows that may carry the named field.
 */
export function dateDesc<K extends string>(
  field: K
): (
  left: Readonly<Partial<Record<K, HarperDate | null | undefined>>>,
  right: Readonly<Partial<Record<K, HarperDate | null | undefined>>>
) => number {
  return (left, right) =>
    String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? ""));
}

/**
 * Returns the lexicographically-largest non-null value of a HarperDate field across the rows.
 * @param rows Rows that may carry the named field.
 * @param field Field name to inspect.
 * @returns The latest date, or null when no row supplied one.
 */
export function latestDate<K extends string>(
  rows: readonly Readonly<Partial<Record<K, HarperDate | null | undefined>>>[],
  field: K
): HarperDate | null {
  const values = rows
    .map(row => row?.[field])
    .filter((value): value is HarperDate => Boolean(value));
  return values.slice().sort(compareHarperDateAsc).at(-1) ?? null;
}

/**
 * Ascending comparator for HarperDate values, used as the sort key in `latestDate`.
 * @param a Left value.
 * @param b Right value.
 * @returns Standard comparator result.
 */
function compareHarperDateAsc(a: HarperDate, b: HarperDate): number {
  return String(a).localeCompare(String(b));
}

/**
 * Defensively reads `id` off a possibly-untyped firm chip, returning null when the value isn't a
 * string-keyed object.
 * @param value Candidate firm chip.
 * @returns The firm id, or null.
 */
export function transitionFirmId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const id = Reflect.get(value, "id");
  return typeof id === "string" ? id : null;
}

/**
 * Returns the most recent ranking year across the appearances as a string, used as the freshness
 * asOf marker for the ranking-presence module.
 * @param appearances Ranking appearance rows.
 * @returns The latest year as a string, or null when none are loaded.
 */
export function latestRankingYear(
  appearances: readonly RankingAppearance[]
): string | null {
  const years = appearances
    .map(row => row.ranking?.year)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);
  const year = years.at(-1);
  return year != null ? String(year) : null;
}

/**
 * Builds the BrokerCheckSource attribution block, pointing the source URL at the firm-summary page
 * when a CRD is known and the BrokerCheck root otherwise.
 * @param fetchedAt Snapshot fetch timestamp.
 * @param subjectCrd Firm CRD, when available.
 * @returns The attribution block.
 */
export function brokerCheckSource(
  fetchedAt: HarperDate | null,
  subjectCrd: string | null
): BrokerCheckSource {
  return {
    sourceName: "FINRA BrokerCheck",
    sourceUrl: subjectCrd
      ? `${BROKERCHECK_SOURCE_URL}firm/summary/${encodeURIComponent(subjectCrd)}`
      : BROKERCHECK_SOURCE_URL,
    termsUrl: BROKERCHECK_TERMS_URL,
    compiledAsOf: fetchedAt ?? null,
  };
}
