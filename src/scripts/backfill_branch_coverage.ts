#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { buildBranchCoverageRows } from "../harper/resource-branch-coverage-read-model.js";
import { describeTarget, op, sql, upsert } from "../lib/harper.js";
import type {
  BranchRow,
  EmploymentHistoryRow,
  FirmRow,
} from "../types/harper-schema.js";

const UPSERT_BATCH_SIZE = 500;

/** Source rows needed by the branch coverage backfill. */
interface SourceRows {
  readonly branches: ReadonlyArray<BranchRow>;
  readonly firms: ReadonlyArray<FirmRow>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
  readonly existingCoverageIds: ReadonlyArray<string>;
}

/** Minimal BranchCoverage id row read before pruning stale rows. */
interface BranchCoverageIdRow {
  readonly id: string;
}

/**
 * Reads all rows needed to materialize public branch coverage.
 * @returns Branch, firm, and employment rows from Harper.
 */
async function readSourceRows(): Promise<SourceRows> {
  const [branches, firms, employments, existingCoverageIds] = await Promise.all(
    [
      readTableRows<BranchRow>("SELECT * FROM data.Branch"),
      readTableRows<FirmRow>("SELECT * FROM data.Firm"),
      readTableRows<EmploymentHistoryRow>(
        "SELECT * FROM data.EmploymentHistory"
      ),
      readTableRows<BranchCoverageIdRow>("SELECT id FROM data.BranchCoverage"),
    ]
  );
  return {
    branches,
    firms,
    employments,
    existingCoverageIds: existingCoverageIds.map(row => row.id),
  };
}

/**
 * Reads typed Harper rows through the generic SQL operation boundary.
 * @param query - SQL query.
 * @returns Typed row array.
 */
async function readTableRows<T>(query: string): Promise<ReadonlyArray<T>> {
  return (await sql(query)) as unknown as ReadonlyArray<T>;
}

/**
 * Upserts generated coverage rows in bounded batches.
 * @param rows - Branch coverage rows to write.
 * @returns Count of rows accepted by Harper.
 */
async function upsertCoverageRows(
  rows: ReturnType<typeof buildBranchCoverageRows>
): Promise<number> {
  const batches = Array.from(
    { length: Math.ceil(rows.length / UPSERT_BATCH_SIZE) },
    (_unused, index) =>
      rows.slice(index * UPSERT_BATCH_SIZE, (index + 1) * UPSERT_BATCH_SIZE)
  );
  return batches.reduce<Promise<number>>(async (totalPromise, batch, index) => {
    const total = await totalPromise;
    const count = await upsert(
      "BranchCoverage",
      batch as unknown as ReadonlyArray<Readonly<Record<string, unknown>>>
    );
    console.log(
      `[backfill:branch-coverage] batch=${index + 1} rows=${batch.length} touched=${count}`
    );
    return total + count;
  }, Promise.resolve(0));
}

/**
 * Deletes stale BranchCoverage rows that are absent from the next snapshot.
 * @param existingIds - BranchCoverage ids currently stored in Harper.
 * @param nextRows - BranchCoverage rows generated for the current source set.
 * @returns Number of stale rows deleted.
 */
async function deleteStaleCoverageRows(
  existingIds: ReadonlyArray<string>,
  nextRows: ReturnType<typeof buildBranchCoverageRows>
): Promise<number> {
  const nextIds = new Set(nextRows.map(row => row.id));
  const staleIds = existingIds.filter(id => !nextIds.has(id));
  if (staleIds.length === 0) return 0;
  await op({
    operation: "delete",
    database: "data",
    table: "BranchCoverage",
    hash_values: staleIds,
  });
  console.log(`[backfill:branch-coverage] pruned=${staleIds.length}`);
  return staleIds.length;
}

/**
 * Materializes BranchCoverage from Branch/Firm/EmploymentHistory.
 * @returns Promise that resolves after the backfill completes.
 */
async function main(): Promise<void> {
  const target = describeTarget();
  const sourceRows = await readSourceRows();
  const coverageRows = buildBranchCoverageRows(sourceRows);
  const pruned = await deleteStaleCoverageRows(
    sourceRows.existingCoverageIds,
    coverageRows
  );
  const touched = await upsertCoverageRows(coverageRows);
  console.log(
    `[backfill:branch-coverage] done target=${target} branches=${sourceRows.branches.length} rows=${coverageRows.length} touched=${touched} pruned=${pruned}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
