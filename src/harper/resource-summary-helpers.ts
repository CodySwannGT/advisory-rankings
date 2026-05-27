/**
 * Tiny shared helpers used by per-entity profile/summary builders.
 *
 * Kept in their own module so individual `resource-*.ts` payload
 * builders stay under the project-wide `max-lines` threshold without
 * duplicating the same date/tally logic across files.
 */
import { dateMs } from "./resource-pagination.js";

/** Date value as Harper hands it back over either transport. */
export type DateLike = Date | string | null | undefined;

/** Stable per-bucket tally produced by `countMap`. */
export type CountMap<K extends string> = Readonly<Record<K, number>>;

/**
 * Builds a stable tally object with every public key present.
 * @param keys - Keys that should always be present.
 * @param values - Source values to tally.
 * @returns Count object with every requested key represented.
 */
export function countMap<K extends string>(
  keys: readonly K[],
  values: readonly (string | null | undefined)[] = []
): CountMap<K> {
  const entries = keys.map((key): readonly [K, number] => [
    key,
    values.filter(value => String(value ?? "").toLowerCase() === key).length,
  ]);
  return Object.fromEntries(entries) as CountMap<K>;
}

/**
 * Returns the latest date-like value, preserving the original string.
 * @param values - Candidate dates.
 * @returns Latest date-like value or null.
 */
export function latestDate(values: readonly DateLike[]): DateLike {
  return values.reduce<DateLike>(laterDate, null);
}

/**
 * Returns the earliest date-like value, preserving the original string.
 * @param values - Candidate dates.
 * @returns Earliest date-like value or null.
 */
export function earliestDate(values: readonly DateLike[]): DateLike {
  return values.reduce<DateLike>(earlierDate, null);
}

/**
 * Returns the later of two date-like values, preserving the original string.
 * @param current - Current winning date.
 * @param candidate - Candidate date.
 * @returns Later date-like value or null.
 */
function laterDate(current: DateLike, candidate: DateLike): DateLike {
  if (!candidate) return current;
  return !current || dateMs(candidate) > dateMs(current) ? candidate : current;
}

/**
 * Returns the earlier of two date-like values, preserving the original string.
 * @param current - Current winning date.
 * @param candidate - Candidate date.
 * @returns Earlier date-like value or null.
 */
function earlierDate(current: DateLike, candidate: DateLike): DateLike {
  if (!candidate) return current;
  return !current || dateMs(candidate) < dateMs(current) ? candidate : current;
}
