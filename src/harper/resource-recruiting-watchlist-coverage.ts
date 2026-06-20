import type { EmploymentHistoryRow, FirmRow } from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";

/** Public branch coverage context for one watched firm query. */
export interface WatchlistBranchCoverage {
  readonly status: "loaded" | "partial" | "unavailable";
  readonly branchCount: number | null;
  readonly currentAdvisorCount: number | null;
  readonly branchesWithCurrentAdvisors: number | null;
  readonly partialBranchCount: number | null;
  readonly sourceTypes: ReadonlyArray<string>;
  readonly sourceRefCount: number | null;
  readonly missingSourceCount: number | null;
  readonly limitation: string;
}

/** Public replay and evidence targets for one watched firm query. */
export interface WatchlistEvidenceLinks {
  readonly recruiting: string;
  readonly recruitingResource: string;
  readonly firmProfile: string | null;
  readonly firmProfileResource: string | null;
  readonly branchExplorer: string | null;
  readonly publicBranchesResource: string | null;
  readonly dataCoverage: string;
  readonly dataCoverageResource: string;
}

/** Intermediate public counts derived from firm branch employment links. */
interface BranchCoverageCounts {
  readonly currentAdvisorCount: number;
  readonly branchesWithCurrentAdvisors: number;
  readonly sourceTypes: ReadonlyArray<string>;
  readonly sourceRefCount: number;
  readonly missingSourceCount: number;
}

/**
 * Summarizes public branch/advisor coverage for a resolved firm.
 * @param db - Loaded resource index used to inspect public branch rows.
 * @param firm - Resolved firm row.
 * @returns Public branch coverage context with limitation copy.
 */
export function branchCoverage(
  db: ResourceIndex,
  firm: FirmRow
): WatchlistBranchCoverage {
  const firmBranches = db.branches.filter(branch => branch.firmId === firm.id);
  if (firmBranches.length === 0) return emptyResolvedBranchCoverage();

  const branchIds = new Set(firmBranches.map(branch => branch.id));
  const linkedEmployments = db.employments.filter(
    employment =>
      employment.firmId === firm.id &&
      employment.branchId != null &&
      branchIds.has(employment.branchId)
  );
  const counts = branchCoverageCounts(linkedEmployments);
  const partialBranchCount =
    firmBranches.length - counts.branchesWithCurrentAdvisors;

  return {
    status:
      partialBranchCount > 0 || counts.missingSourceCount > 0
        ? "partial"
        : "loaded",
    branchCount: firmBranches.length,
    currentAdvisorCount: counts.currentAdvisorCount,
    branchesWithCurrentAdvisors: counts.branchesWithCurrentAdvisors,
    partialBranchCount,
    sourceTypes: counts.sourceTypes,
    sourceRefCount: counts.sourceRefCount,
    missingSourceCount: counts.missingSourceCount,
    limitation: branchCoverageLimitation(
      partialBranchCount,
      counts.missingSourceCount
    ),
  };
}

/**
 * Builds explicit null coverage for an unresolved firm query.
 * @param query - Original firm query string.
 * @returns Unavailable branch coverage context.
 */
export function unresolvedBranchCoverage(
  query: string
): WatchlistBranchCoverage {
  return {
    status: "unavailable",
    branchCount: null,
    currentAdvisorCount: null,
    branchesWithCurrentAdvisors: null,
    partialBranchCount: null,
    sourceTypes: [],
    sourceRefCount: null,
    missingSourceCount: null,
    limitation: `Branch and advisor coverage are unavailable because "${query}" did not resolve to a public firm.`,
  };
}

/**
 * Builds public evidence and replay URLs for one watchlist item.
 * @param query - Original firm query string.
 * @param firm - Resolved firm row, if any.
 * @returns Public links safe for anonymous clients.
 */
export function evidenceLinks(
  query: string,
  firm: FirmRow | null
): WatchlistEvidenceLinks {
  const firmParam = encodeURIComponent(firm?.id ?? query);
  const queryParam = encodeURIComponent(query);
  return {
    recruiting: `/recruiting?firm=${queryParam}`,
    recruitingResource: `/RecruitingMarket?firm=${queryParam}`,
    firmProfile: firm ? `/firm.html?id=${encodeURIComponent(firm.id)}` : null,
    firmProfileResource: firm
      ? `/FirmProfile/${encodeURIComponent(firm.id)}`
      : null,
    branchExplorer: firm ? `/branches?firm=${firmParam}` : null,
    publicBranchesResource: firm ? `/PublicBranches?firm=${firmParam}` : null,
    dataCoverage: "/coverage",
    dataCoverageResource: "/DataCoverage",
  };
}

/**
 * Builds coverage for a resolved firm with no public branch rows.
 * @returns Public partial coverage context.
 */
function emptyResolvedBranchCoverage(): WatchlistBranchCoverage {
  return {
    status: "partial",
    branchCount: 0,
    currentAdvisorCount: null,
    branchesWithCurrentAdvisors: 0,
    partialBranchCount: 0,
    sourceTypes: [],
    sourceRefCount: 0,
    missingSourceCount: 0,
    limitation:
      "No public branch rows are loaded for this firm; this does not imply the firm has no offices.",
  };
}

/**
 * Counts public advisor/source coverage for firm branch links.
 * @param employments - Employment rows linked to known firm branches.
 * @returns Public coverage counts.
 */
function branchCoverageCounts(
  employments: ReadonlyArray<EmploymentHistoryRow>
): BranchCoverageCounts {
  const currentEmployments = employments.filter(
    employment => !employment.endDate
  );
  return {
    currentAdvisorCount: new Set(
      currentEmployments.map(employment => employment.advisorId)
    ).size,
    branchesWithCurrentAdvisors: new Set(
      currentEmployments.map(employment => employment.branchId)
    ).size,
    sourceTypes: distinctStrings(
      employments.map(employment => employment.sourceType)
    ),
    sourceRefCount: distinctStrings(
      employments.map(employment => employment.sourceRef)
    ).length,
    missingSourceCount: employments.filter(employment => !employment.sourceRef)
      .length,
  };
}

/**
 * Builds limitation copy for public branch coverage.
 * @param partialBranchCount - Branch rows without current advisor links.
 * @param missingSourceCount - Linked employment rows without public source refs.
 * @returns Human-facing limitation copy.
 */
function branchCoverageLimitation(
  partialBranchCount: number,
  missingSourceCount: number
): string {
  const limitations = [
    partialBranchCount > 0
      ? `${partialBranchCount} branch rows do not have current advisor links.`
      : null,
    missingSourceCount > 0
      ? `${missingSourceCount} advisor-branch links are missing public source references.`
      : null,
  ].filter((item): item is string => Boolean(item));
  return limitations.length > 0
    ? limitations.join(" ")
    : "Public branch rows and advisor links are loaded for this firm.";
}

/**
 * Returns sorted unique non-empty strings.
 * @param values - Candidate values.
 * @returns Stable distinct strings.
 */
function distinctStrings(
  values: ReadonlyArray<string | null | undefined>
): ReadonlyArray<string> {
  return [...new Set(values.filter(isNonEmptyString))].sort((left, right) =>
    left.localeCompare(right)
  );
}

/**
 * Narrows non-empty strings.
 * @param value - Candidate value.
 * @returns True when the value is non-empty text.
 */
function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
