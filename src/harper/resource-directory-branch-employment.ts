import type {
  BranchRow,
  EmploymentHistoryRow,
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
 * Loads employment rows through the indexed branchId column for represented
 * public branches.
 * @param tables - Harper table registry.
 * @param branches - Branch rows whose branch ids need employment context.
 * @returns Employment rows for the branches.
 */
export async function employmentRowsForBranches(
  tables: HarperTables,
  branches: ReadonlyArray<BranchRow>
): Promise<ReadonlyArray<EmploymentHistoryRow>> {
  const branchIds = [...new Set(branches.map(branch => branch.id))];
  const batches = Array.from(
    { length: Math.ceil(branchIds.length / BRANCH_EMPLOYMENT_LOOKUP_BATCH) },
    (_unused, batchIndex) =>
      branchIds.slice(
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
      batch.map(branchId =>
        rowsByAttribute<EmploymentHistoryRow>(
          tables.EmploymentHistory,
          "branchId",
          branchId
        )
      )
    );
    return [...collected, ...next];
  }, Promise.resolve([]));
  return rows.flat();
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
