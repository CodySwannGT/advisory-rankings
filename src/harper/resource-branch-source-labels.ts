import type { EmploymentHistoryRow } from "../types/harper-schema.js";
import type { BranchDirectoryRow } from "./resource-directory-types.js";

/** Public labels for branch source identifiers used as filter keys. */
const BRANCH_SOURCE_LABELS: Readonly<Record<string, string>> = {
  brokercheck: "FINRA BrokerCheck registration data",
  edward_jones_advisor_results_api: "Edward Jones public advisor search",
  firm_locator: "Firm public branch locator",
  morgan_stanley_text: "Morgan Stanley public branch text",
  wells_fargo_locator: "Wells Fargo public branch locator",
};

/**
 * Summarizes employment source fields without exposing source reference strings.
 * @param employments - Employment rows already scoped to one branch.
 * @returns Distinct source types, public labels, and no raw source references.
 */
export function branchSourceSummary(
  employments: ReadonlyArray<EmploymentHistoryRow>
): BranchDirectoryRow["sourceMetadata"] {
  const sourceTypes = distinctStrings(employments.map(row => row.sourceType));
  return {
    sourceTypes,
    sourceLabels: sourceTypes.map(publicBranchSourceLabel),
    sourceRefs: [],
  };
}

/**
 * Converts source identifiers into public labels before the web layer renders
 * them, keeping table-style source keys as filter values only.
 * @param sourceType - Employment source type.
 * @returns Human-facing source label.
 */
export function publicBranchSourceLabel(sourceType: string): string {
  return BRANCH_SOURCE_LABELS[sourceType] ?? humanizeSourceType(sourceType);
}

/**
 * Builds a readable fallback for public source types not yet cataloged.
 * @param sourceType - Raw source type identifier.
 * @returns Sentence-case public source label.
 */
function humanizeSourceType(sourceType: string): string {
  const label = sourceType
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map(token => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
  return `${label || "Unknown"} public source`;
}

/**
 * Removes empty and duplicate string values while preserving first-seen order.
 * @param values - Candidate string values.
 * @returns Distinct non-empty values.
 */
function distinctStrings(
  values: ReadonlyArray<string | null | undefined>
): ReadonlyArray<string> {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
