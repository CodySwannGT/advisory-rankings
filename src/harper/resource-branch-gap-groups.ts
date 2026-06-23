import type { FirmRow } from "../types/harper-schema.js";
import type { BranchSourceSummary } from "./resource-directory-types.js";

/** Public branch grouping used by directory rows and coverage rollups. */
export type BranchGapGroup =
  | "loaded"
  | "partial"
  | "unavailable"
  | "zero-advisor"
  | "missing-source";

/** Inputs needed to classify one public branch row. */
interface BranchGapInput {
  readonly firm: Pick<FirmRow, "id"> | null;
  readonly currentAdvisorCount: number;
  readonly sourceMetadata: BranchSourceSummary;
}

/**
 * Classifies public branch data gaps without treating unknowns as clean zeros.
 * @param input - Public branch context.
 * @returns Stable branch gap group.
 */
export function branchGapGroup(input: BranchGapInput): BranchGapGroup {
  if (!input.firm) return "unavailable";
  if (input.currentAdvisorCount > 0)
    return input.sourceMetadata.sourceTypes.length > 0
      ? "loaded"
      : "missing-source";
  return input.sourceMetadata.sourceTypes.length > 0
    ? "zero-advisor"
    : "partial";
}
