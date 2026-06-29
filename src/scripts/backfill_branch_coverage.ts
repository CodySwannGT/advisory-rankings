#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { buildBranchCoverageRows } from "../harper/resource-branch-coverage-read-model.js";
import { describeTarget, sql, upsert } from "../lib/harper.js";
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
}

/**
 * Reads all rows needed to materialize public branch coverage.
 * @returns Branch, firm, and employment rows from Harper.
 */
async function readSourceRows(): Promise<SourceRows> {
  const [branches, firms, employments] = await Promise.all([
    readTableRows<BranchRow>("SELECT * FROM data.Branch"),
    readTableRows<FirmRow>("SELECT * FROM data.Firm"),
    readTableRows<EmploymentHistoryRow>("SELECT * FROM data.EmploymentHistory"),
  ]);
  return { branches, firms, employments };
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
 * Materializes BranchCoverage from Branch/Firm/EmploymentHistory.
 * @returns Promise that resolves after the backfill completes.
 */
async function main(): Promise<void> {
  const target = describeTarget();
  const sourceRows = await readSourceRows();
  const coverageRows = buildBranchCoverageRows(sourceRows);
  const touched = await upsertCoverageRows(coverageRows);
  console.log(
    `[backfill:branch-coverage] done target=${target} branches=${sourceRows.branches.length} rows=${coverageRows.length} touched=${touched}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
