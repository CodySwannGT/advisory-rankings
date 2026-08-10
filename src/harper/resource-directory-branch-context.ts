import type {
  BranchCoverageRow,
  BranchRow,
  EmploymentHistoryRow,
  FirmMergeAuditRow,
  FirmRow,
} from "../types/harper-schema.js";
import {
  branchCoverageByBranch,
  type BranchCoverageByBranch,
} from "./resource-branch-coverage-read-model.js";
import { fallbackEmploymentsByBranch } from "./resource-directory-branch-employment.js";
import { allRows, optionalAll } from "./resource-directory-tables.js";

/** Harper table handles needed to load branch directory context. */
interface BranchDirectoryTables {
  readonly Branch: unknown;
  readonly BranchCoverage: unknown;
  readonly EmploymentHistory: unknown;
  readonly Firm: unknown;
  readonly FirmMergeAudit: unknown;
}

/** Loaded branch directory rows and lookup maps. */
export interface BranchDirectoryContext {
  readonly branches: ReadonlyArray<BranchRow>;
  readonly byFirm: ReadonlyMap<string, FirmRow>;
  readonly coverageByBranch: BranchCoverageByBranch;
  readonly employmentsByBranch: ReadonlyMap<
    string,
    ReadonlyArray<EmploymentHistoryRow>
  >;
}

/**
 * Loads branch rows and the optional materialized coverage context.
 * @param tables - Harper tables needed by the public branch directory.
 * @returns Branch rows plus lookup maps used by directory filtering.
 */
export async function loadBranchDirectoryContext(
  tables: BranchDirectoryTables
): Promise<BranchDirectoryContext> {
  const [branches, firms, branchCoverages] = await Promise.all([
    allRows<BranchRow>(tables.Branch),
    allRows<FirmRow>(tables.Firm),
    optionalAll<BranchCoverageRow>(tables.BranchCoverage),
  ]);
  const coverageByBranch = branchCoverageByBranch(branchCoverages);
  return {
    branches,
    byFirm: new Map(firms.map(firm => [firm.id, firm])),
    coverageByBranch,
    employmentsByBranch:
      coverageByBranch.size === branches.length
        ? new Map<string, ReadonlyArray<EmploymentHistoryRow>>()
        : await fallbackEmploymentsByBranch(
            { EmploymentHistory: tables.EmploymentHistory },
            branches,
            await optionalAll<FirmMergeAuditRow>(tables.FirmMergeAudit)
          ),
  };
}
