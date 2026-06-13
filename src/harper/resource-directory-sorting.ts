import type { AdvisorRow, FirmRow, TeamRow } from "../types/harper-schema.js";
import {
  advisorSearchMatches,
  firmSearchMatches,
  teamSearchMatches,
} from "./resource-search.js";
import type {
  BranchDirectoryRow,
  RankedSearchInput,
  SearchMatch,
  TeamDirectoryRow,
} from "./resource-directory-types.js";

/** Minimal row shape needed for deterministic cursor tie-breaking. */
interface RowWithId {
  readonly id: string;
}

/**
 * Sorts firms by public display name.
 * @param firm - Firm row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
export function firmDirectoryKey(firm: FirmRow): string {
  return (firm.name || "").toLowerCase();
}

/**
 * Sorts advisors by their best available surname-like field.
 * @param advisor - Advisor row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
export function advisorDirectoryKey(advisor: AdvisorRow): string {
  return (advisor.lastName || advisor.legalName || "").toLowerCase();
}

/**
 * Sorts teams by public display name.
 * @param team - Team row from the public directory table.
 * @returns Lowercase key used for cursor pagination.
 */
export function teamDirectoryKey(team: TeamRow): string {
  return (team.name || "").toLowerCase();
}

/**
 * Sorts public branch rows by firm, location, and display label.
 * @param branch - Enriched branch directory row.
 * @returns Lowercase key used for cursor pagination.
 */
export function branchDirectoryKey(branch: BranchDirectoryRow): string {
  return [branch.firmName, branch.state, branch.city, branch.displayName]
    .map(value => value || "")
    .join("\x00")
    .toLowerCase();
}

/**
 * Orders firm directory rows while keeping cursor ties deterministic.
 * @param a - Left firm row.
 * @param b - Right firm row.
 * @returns Negative, zero, or positive comparison result.
 */
export function compareFirmDirectoryRows(a: FirmRow, b: FirmRow): number {
  return compareDirectoryRows(a, b, firmDirectoryKey);
}

/**
 * Orders advisor directory rows while keeping cursor ties deterministic.
 * @param a - Left advisor row.
 * @param b - Right advisor row.
 * @returns Negative, zero, or positive comparison result.
 */
export function compareAdvisorDirectoryRows(
  a: AdvisorRow,
  b: AdvisorRow
): number {
  return compareDirectoryRows(a, b, advisorDirectoryKey);
}

/**
 * Orders team directory rows while keeping cursor ties deterministic.
 * @param a - Left team row.
 * @param b - Right team row.
 * @returns Negative, zero, or positive comparison result.
 */
export function compareTeamDirectoryRows(
  a: TeamDirectoryRow,
  b: TeamDirectoryRow
): number {
  return compareDirectoryRows(a, b, teamDirectoryKey);
}

/**
 * Orders branch directory rows while keeping cursor ties deterministic.
 * @param a - Left branch row.
 * @param b - Right branch row.
 * @returns Negative, zero, or positive comparison result.
 */
export function compareBranchDirectoryRows(
  a: BranchDirectoryRow,
  b: BranchDirectoryRow
): number {
  return compareDirectoryRows(a, b, branchDirectoryKey);
}

/**
 * Combines cross-entity search matches into one relevance-sorted list.
 * @param parts - Public entity rows and lookup maps needed for scoring.
 * @returns Ranked firm, advisor, and team matches.
 */
export function rankedSearchMatches(
  parts: RankedSearchInput
): ReadonlyArray<SearchMatch> {
  return [
    ...(firmSearchMatches(
      parts.firms,
      parts.norm
    ) as ReadonlyArray<SearchMatch>),
    ...(advisorSearchMatches(
      parts.advisors,
      parts.byFirm,
      parts.currentFirmByAdvisor,
      parts.norm
    ) as ReadonlyArray<SearchMatch>),
    ...(teamSearchMatches(
      parts.teams,
      parts.byFirm,
      parts.norm
    ) as ReadonlyArray<SearchMatch>),
  ].sort(
    (a, b) =>
      b.score - a.score ||
      (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)
  );
}

/**
 * Applies the shared cursor sort contract to directory resources.
 * @param a - Left directory row.
 * @param b - Right directory row.
 * @param keyOf - Sort-key callback used by pagination.
 * @returns Negative, zero, or positive comparison result.
 */
function compareDirectoryRows<T extends RowWithId>(
  a: T,
  b: T,
  keyOf: (row: T) => string
): number {
  const left = keyOf(a),
    right = keyOf(b);
  return left === right
    ? (a.id || "").localeCompare(b.id || "")
    : left < right
      ? -1
      : 1;
}
