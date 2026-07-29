import type {
  BranchCoverageRow,
  EmploymentHistoryRow,
  FirmRow,
} from "../types/harper-schema.js";
import {
  branchGapGroup,
  type BranchGapGroup,
} from "./resource-branch-gap-groups.js";
import { branchCoverageSourceMetadata } from "./resource-branch-coverage-read-model.js";
import { branchSourceSummary } from "./resource-branch-source-labels.js";
import { currentBranchAdvisorCount } from "./resource-directory-branch-employment.js";
import type { BranchSourceSummary } from "./resource-directory-types.js";

/** Enriched branch context used by directory filters and rows. */
interface BranchDirectoryMatchContext {
  readonly currentAdvisorCount: number;
  readonly gapGroup: BranchGapGroup;
  readonly sourceMetadata: BranchSourceSummary;
}

/** Inputs used to build enriched branch directory context. */
interface BranchDirectoryMatchInput {
  readonly branchId: string;
  readonly coverage: BranchCoverageRow | null;
  readonly employmentsByBranch: ReadonlyMap<
    string,
    ReadonlyArray<EmploymentHistoryRow>
  >;
  readonly firm: FirmRow | null;
}

/**
 * Builds the derived branch fields shared by filtering and row projection.
 * @param input - Branch coverage and employment context.
 * @param input.branchId - Candidate branch id.
 * @param input.coverage - Materialized branch coverage row, when present.
 * @param input.employmentsByBranch - Fallback employment rows keyed by branch id.
 * @param input.firm - Joined firm row, when present.
 * @returns Branch directory match context.
 */
export function branchDirectoryMatchContext(
  input: BranchDirectoryMatchInput
): BranchDirectoryMatchContext {
  const linkedEmployments = input.coverage
    ? []
    : (input.employmentsByBranch.get(input.branchId) ?? []);
  const currentAdvisorCount =
    input.coverage?.currentAdvisorCount ??
    currentBranchAdvisorCount(linkedEmployments);
  const sourceMetadata = input.coverage
    ? branchCoverageSourceMetadata(input.coverage)
    : branchSourceSummary(linkedEmployments);
  const gapGroup =
    input.coverage?.gapGroup ??
    branchGapGroup({ firm: input.firm, currentAdvisorCount, sourceMetadata });
  return { currentAdvisorCount, gapGroup, sourceMetadata };
}
