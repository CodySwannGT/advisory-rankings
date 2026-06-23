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

/**
 * Loads employment rows through the allowed firmId index for firms represented
 * in the branch directory slice.
 * @param tables - Harper table registry.
 * @param branches - Branch rows whose firms need employment context.
 * @returns Employment rows for the branch firms.
 */
export async function employmentRowsForBranchFirms(
  tables: HarperTables,
  branches: ReadonlyArray<BranchRow>
): Promise<ReadonlyArray<EmploymentHistoryRow>> {
  const firmIds = [...new Set(branches.map(branch => branch.firmId))];
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
  const branchIds = [
    ...new Set(
      employments
        .map(employment => employment.branchId)
        .filter((branchId): branchId is string => Boolean(branchId))
    ),
  ];
  return new Map(
    branchIds.map(branchId => [
      branchId,
      employments.filter(employment => employment.branchId === branchId),
    ])
  );
}
