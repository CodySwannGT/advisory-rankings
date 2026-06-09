/**
 * Pure matching and normalization helpers used by {@link Resolver}.
 * @module brokercheck-resolver-helpers
 */

/** Runtime Harper row returned by REST list endpoints. */
export interface HarperRow {
  readonly [key: string]: unknown;
}

/** Optional advisor name hints used when BrokerCheck lacks a reusable CRD match. */
export interface AdvisorResolverOptions {
  readonly firstEmployer?: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

/** Resolver statistic counter names tracked while loading BrokerCheck rows. */
export type ResolverStatKey =
  | "advisor_matched_crd"
  | "advisor_matched_name"
  | "advisor_minted"
  | "firm_matched_crd"
  | "firm_matched_name"
  | "firm_minted"
  | "disclosure_matched"
  | "disclosure_minted"
  | "employment_matched"
  | "employment_minted"
  | "sanction_matched"
  | "sanction_minted"
  | "license_matched"
  | "license_minted";

/** Mutable counter map keyed by the resolver statistic names above. */
export type ResolverStats = Record<ResolverStatKey, number>;

/** Resolved firm-by-CRD hit with the matching stat counter to bump. */
export interface FirmCrdHit {
  readonly id: string;
  readonly stat: ResolverStatKey;
}

/**
 * Type guard for plain objects returned by Harper list endpoints.
 * @param value - Candidate value parsed from a Harper REST response.
 * @returns True when the value is a non-array object suitable for row access.
 */
const isHarperRow = (value: unknown): value is HarperRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Filters an unknown REST payload down to the rows it contains.
 * @param value - Raw response body from a Harper REST list endpoint.
 * @returns Array of plain-object rows; empty when the payload is not an array.
 */
export const asRows = (value: unknown): ReadonlyArray<HarperRow> =>
  Array.isArray(value) ? value.filter(isHarperRow) : [];

/**
 * Builds a fresh zeroed-out resolver statistic counter map.
 * @returns Counter map with every {@link ResolverStatKey} initialised to zero.
 */
export const initialStats = (): ResolverStats => ({
  advisor_matched_crd: 0,
  advisor_matched_name: 0,
  advisor_minted: 0,
  firm_matched_crd: 0,
  firm_matched_name: 0,
  firm_minted: 0,
  disclosure_matched: 0,
  disclosure_minted: 0,
  employment_matched: 0,
  employment_minted: 0,
  sanction_matched: 0,
  sanction_minted: 0,
  license_matched: 0,
  license_minted: 0,
});

/**
 * Renders an unknown row cell as a string, treating null/undefined as empty.
 * @param value - Field value read from a Harper row.
 * @returns String form of the value, or `""` for nullish.
 */
export const rowString = (value: unknown): string =>
  value == null ? "" : String(value);

/**
 * Extracts the date part from BrokerCheck date/time values.
 * @param value - Raw date value from parsed BrokerCheck content.
 * @returns An ISO-like `YYYY-MM-DD` prefix, or an empty string for missing values.
 */
export function datePrefix(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Normalizes firm name for consistent comparisons.
 * @param value - Raw value to normalize or parse.
 * @returns The normalized value.
 */
function normalizeFirmName(value: string): string {
  const compact = value
    .toLowerCase()
    .trim()
    .replaceAll(",", " ")
    .replaceAll(".", " ");
  const token = [
    " llc",
    " l l c",
    " inc",
    " l p",
    " lp",
    " corporation",
    " corp",
  ].find(suffix => compact.endsWith(suffix));
  const withoutSuffix = token ? compact.slice(0, -token.length) : compact;
  return withoutSuffix.trim().split(/\s+/u).join(" ");
}

/**
 * Compares two firm names after normalization.
 * @param a - First firm name.
 * @param b - Second firm name.
 * @returns True when both names are non-empty and normalize identically.
 */
export function firmNameMatch(a: string, b: string): boolean {
  return Boolean(a && b) && normalizeFirmName(a) === normalizeFirmName(b);
}

/**
 * Matches advisors by exact lowercased legal name.
 * @param advisorListing - Loaded advisor rows from Harper.
 * @param legalName - Full legal name from BrokerCheck.
 * @returns Existing advisor ID, or null when no exact name match exists.
 */
export function matchAdvisorLegalName(
  advisorListing: ReadonlyArray<HarperRow>,
  legalName: string
): string | null {
  const lower = legalName.toLowerCase();
  if (!lower) return null;
  const match = advisorListing.find(
    row => rowString(row.legalName).toLowerCase() === lower
  );
  return match ? rowString(match.id) : null;
}

/**
 * Resolves cases where one source has a first initial and the other has a full name.
 * @param advisorListing - Loaded advisor rows from Harper.
 * @param first - Lowercased first name from BrokerCheck.
 * @param last - Lowercased last name from BrokerCheck.
 * @returns Existing advisor ID when the last-name match is unique and compatible.
 */
function matchAdvisorLastNameInitial(
  advisorListing: ReadonlyArray<HarperRow>,
  first: string,
  last: string
): string | null {
  const lastOnly = advisorListing.filter(
    row => rowString(row.lastName).toLowerCase() === last
  );
  const candidate = lastOnly.length === 1 ? lastOnly[0] : null;
  if (!candidate) return null;
  const candidateFirst = rowString(candidate.firstName)
    .toLowerCase()
    .replace(/\.$/, "");
  const cleanFirst = first.replace(/\.$/, "");
  return candidateFirst &&
    (candidateFirst.startsWith(cleanFirst) ||
      cleanFirst.startsWith(candidateFirst))
    ? rowString(candidate.id)
    : null;
}

/**
 * Matches advisors by first and last name, including initial/full-name pairs.
 * @param advisorListing - Loaded advisor rows from Harper.
 * @param opts - Parsed first and last names from BrokerCheck.
 * @returns Existing advisor ID only when the fallback result is unambiguous.
 */
export function matchAdvisorFirstLast(
  advisorListing: ReadonlyArray<HarperRow>,
  opts: AdvisorResolverOptions
): string | null {
  const first = (opts.firstName ?? "").toLowerCase();
  const last = (opts.lastName ?? "").toLowerCase();
  if (!first || !last) return null;
  const firstLast = advisorListing.filter(
    row =>
      rowString(row.firstName).toLowerCase() === first &&
      rowString(row.lastName).toLowerCase() === last
  );
  if (firstLast.length === 1) return rowString(firstLast[0]?.id);
  return firstLast.length === 0
    ? matchAdvisorLastNameInitial(advisorListing, first, last)
    : null;
}
