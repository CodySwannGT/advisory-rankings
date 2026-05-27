/** Search kind value accepted by the global navbar search UI. */
export type SearchKind = "all" | "advisor" | "firm" | "team";

/** Ordered options rendered by the global search segmented control. */
export const SEARCH_KINDS: readonly (readonly [SearchKind, string])[] = [
  ["all", "All"],
  ["advisor", "Advisors"],
  ["firm", "Firms"],
  ["team", "Teams"],
];

/**
 * Coerces unknown kind values to a supported search filter.
 * @param kind - Candidate kind filter.
 * @returns Supported search kind.
 */
export function normalizeSearchKind(kind: unknown): SearchKind {
  return SEARCH_KINDS.some(([value]) => value === kind)
    ? (kind as SearchKind)
    : "all";
}

/**
 * Formats the search count hint for the currently selected kind mode.
 * @param visibleCount - Number of rendered rows.
 * @param totalCount - Total matching rows for the active kind.
 * @param kind - Active search kind filter.
 * @returns Human-readable count hint copy.
 */
export function searchCountHint(
  visibleCount: number,
  totalCount: number,
  kind: SearchKind
): string {
  const noun =
    kind === "all" ? "matches" : `${kindLabel(kind).toLowerCase()} matches`;
  if (totalCount <= visibleCount) return `Showing ${visibleCount} ${noun}.`;
  return `Showing ${visibleCount} of ${totalCount} ${noun} - keep typing to narrow.`;
}

/**
 * Human-readable singular label for a search kind.
 * @param kind - Active search kind.
 * @returns Display label.
 */
function kindLabel(kind: SearchKind): string {
  return {
    all: "All",
    advisor: "Advisor",
    firm: "Firm",
    team: "Team",
  }[kind];
}
