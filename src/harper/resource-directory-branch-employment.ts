import type {
  BranchRow,
  EmploymentHistoryRow,
  FirmMergeAuditRow,
} from "../types/harper-schema.js";
import { rowsByAttribute } from "./resource-directory-tables.js";

const BRANCH_EMPLOYMENT_LOOKUP_BATCH = 25;

/** Harper tables needed to resolve branch employment context. */
interface HarperTables {
  readonly EmploymentHistory: unknown;
}

/** Immutable branch-employment grouping entries before Map materialization. */
type BranchEmploymentEntries = ReadonlyArray<
  readonly [string, ReadonlyArray<EmploymentHistoryRow>]
>;

/**
 * Loads employment rows through the allowed firmId index for public branch
 * firms, including pre-merge firm ids that still own branch-linked rows.
 * @param tables - Harper table registry.
 * @param branches - Branch rows whose branch ids need employment context.
 * @param firmMergeAudits - Firm merge rows used to expand canonical firm ids.
 * @returns Employment rows for the branches.
 */
export async function employmentRowsForBranches(
  tables: HarperTables,
  branches: ReadonlyArray<BranchRow>,
  firmMergeAudits: ReadonlyArray<FirmMergeAuditRow>
): Promise<ReadonlyArray<EmploymentHistoryRow>> {
  const branchIds = new Set(branches.map(branch => branch.id));
  const firmIds = firmIdsForBranches(branches, firmMergeAudits);
  const batches = Array.from(
    { length: Math.ceil(firmIds.length / BRANCH_EMPLOYMENT_LOOKUP_BATCH) },
    (_unused, batchIndex) =>
      firmIds.slice(
        batchIndex * BRANCH_EMPLOYMENT_LOOKUP_BATCH,
        batchIndex * BRANCH_EMPLOYMENT_LOOKUP_BATCH +
          BRANCH_EMPLOYMENT_LOOKUP_BATCH
      )
  );
  const rows = await batches.reduce<
    Promise<ReadonlyArray<ReadonlyArray<EmploymentHistoryRow>>>
  >(async (accumulated, batch) => {
    const collected = await accumulated;
    const next = await Promise.all(
      batch.map(firmId =>
        rowsByAttribute<EmploymentHistoryRow>(
          tables.EmploymentHistory,
          "firmId",
          firmId
        )
      )
    );
    return [...collected, ...next];
  }, Promise.resolve([]));
  return rows.flat().filter(row => row.branchId && branchIds.has(row.branchId));
}

/**
 * Loads legacy branch employment context only when the materialized coverage
 * read model is unavailable.
 * @param tables - Harper table registry.
 * @param branches - Branch rows whose branch ids need employment context.
 * @param firmMergeAudits - Firm merge rows used to expand canonical firm ids.
 * @returns Employment rows keyed by branch id.
 */
export async function fallbackEmploymentsByBranch(
  tables: HarperTables,
  branches: ReadonlyArray<BranchRow>,
  firmMergeAudits: ReadonlyArray<FirmMergeAuditRow>
): Promise<ReadonlyMap<string, ReadonlyArray<EmploymentHistoryRow>>> {
  return groupEmploymentsByBranch(
    await employmentRowsForBranches(tables, branches, firmMergeAudits)
  );
}

/**
 * Expands branch firm ids with pre-merge ids that still appear on employment
 * rows.
 * @param branches - Branches being rendered.
 * @param firmMergeAudits - Merge audit rows linking old ids to canonical ids.
 * @returns Firm ids safe to query through the indexed firmId column.
 */
function firmIdsForBranches(
  branches: ReadonlyArray<BranchRow>,
  firmMergeAudits: ReadonlyArray<FirmMergeAuditRow>
): ReadonlyArray<string> {
  const canonicalFirmIds = new Set(branches.map(branch => branch.firmId));
  return [
    ...new Set([
      ...canonicalFirmIds,
      ...firmMergeAudits
        .filter(audit => canonicalFirmIds.has(audit.canonicalFirmId))
        .map(audit => audit.oldFirmId),
    ]),
  ];
}

/**
 * Groups employment rows by branch id once per request.
 * @param employments - Employment rows visible to public branch resources.
 * @returns Employment rows keyed by branch id.
 */
export function groupEmploymentsByBranch(
  employments: ReadonlyArray<EmploymentHistoryRow>
): ReadonlyMap<string, ReadonlyArray<EmploymentHistoryRow>> {
  return new Map(
    employments.reduce<BranchEmploymentEntries>((entries, employment) => {
      if (!employment.branchId) return entries;
      const existing = entries.find(
        ([branchId]) => branchId === employment.branchId
      );
      if (!existing) return [...entries, [employment.branchId, [employment]]];
      return entries.map(([branchId, rows]) =>
        branchId === employment.branchId
          ? [branchId, [...rows, employment]]
          : [branchId, rows]
      );
    }, [])
  );
}
