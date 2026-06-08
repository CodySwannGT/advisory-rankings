import type {
  RecruitingMove,
  RecruitingSourceCoverage,
  RecruitingSourceStatusCount,
} from "./resource-recruiting-market-types.js";

/**
 * Counts source-status gaps across the full filtered move slice.
 * @param moves Move list already narrowed by the request filters.
 * @returns Source-backed and missing-field counts for the same slice.
 */
export function sourceCoverage(
  moves: readonly RecruitingMove[]
): RecruitingSourceCoverage {
  return {
    moveCount: moves.length,
    sourceBackedCount: countMovesWithStatus(moves, "source-backed"),
    missingSourceCount: countMovesWithStatus(moves, "missing-source"),
    missingLocationCount: countMovesWithStatus(moves, "missing-location"),
    missingAumCount: countMovesWithStatus(moves, "missing-aum"),
    missingT12Count: countMovesWithStatus(moves, "missing-t12"),
    statusCounts: sourceStatusCounts(moves),
  };
}

/**
 * Counts moves carrying one source-status token.
 * @param moves Move list to inspect.
 * @param status Source-status token.
 * @returns Number of moves carrying the token.
 */
function countMovesWithStatus(
  moves: readonly RecruitingMove[],
  status: string
): number {
  return moves.filter(move => move.sourceStatus.includes(status)).length;
}

/**
 * Builds sorted counts for every source-status token in a move slice.
 * @param moves Move list to inspect.
 * @returns Status counts sorted by descending frequency.
 */
function sourceStatusCounts(
  moves: readonly RecruitingMove[]
): readonly RecruitingSourceStatusCount[] {
  const counts = moves
    .flatMap(move => move.sourceStatus)
    .reduce<
      ReadonlyMap<string, number>
    >((acc, status) => new Map(acc).set(status, (acc.get(status) ?? 0) + 1), new Map());
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.status.localeCompare(right.status)
    );
}
