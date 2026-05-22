#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  FIRM_REFERENCE_FIELDS,
  buildFirmMergePlan,
} from "../lib/firm-merge.js";
import {
  describeTarget,
  harperConfig,
  op,
  sql,
  upsert,
} from "../lib/harper.js";

const SEED_FILE_ARG = "--seed-file";
const BASE_TABLES = ["Firm", "FirmAlias", "FirmMergeAudit"];
const TABLES = [
  ...new Set([
    ...BASE_TABLES,
    ...FIRM_REFERENCE_FIELDS.map(({ table }) => table),
  ]),
];

/**
 * Reads a named CLI flag value without introducing an argument parser dependency.
 * @param name - Flag name such as --seed-file.
 * @returns The following argv token when the flag is present.
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Checks whether a boolean CLI switch was provided.
 * @param name - Switch name to find in process.argv.
 * @returns True when the switch appears anywhere in the command line.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Loads all firm-linked table snapshots from either a seed JSON file or Harper.
 * @returns Rows keyed by table name for the merge planner.
 */
async function loadRows(): Promise<
  Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
> {
  const seedFile = arg(SEED_FILE_ARG);
  if (seedFile) {
    return JSON.parse(await readFile(seedFile, "utf8")) as Record<
      string,
      ReadonlyArray<Readonly<Record<string, unknown>>>
    >;
  }

  return Object.fromEntries(
    await Promise.all(
      TABLES.map(async table => [table, await safeSql(table)] as const)
    )
  );
}

/**
 * Reads a Harper table and treats missing optional tables as empty.
 * @param table - Harper table name under the data schema.
 * @returns Existing rows or an empty array when the table is unavailable.
 */
async function safeSql(
  table: string
): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> {
  try {
    return await sql(`SELECT * FROM data.${table}`);
  } catch {
    return [];
  }
}

/**
 * Persists merged rows back to either the seed fixture or Harper upserts.
 * @param rows - Post-merge table snapshots returned by the planner.
 */
async function writeRows(
  rows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
): Promise<void> {
  const seedFile = arg(SEED_FILE_ARG);
  if (seedFile) {
    await writeFile(seedFile, `${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  for (const table of TABLES) {
    const tableRows = rows[table] ?? [];
    if (tableRows.length) {
      const touched = await upsert(
        table,
        tableRows.map(row => ({ ...row }))
      );
      console.log(`  upsert ${table}: ${touched} touched`);
    }
  }
}

/**
 * Deletes duplicate Firm rows after aliases, audits, and foreign keys are persisted.
 * @param ids - Duplicate Firm ids that have already been merged into canonical rows.
 */
async function deleteFirmRows(ids: ReadonlyArray<string>): Promise<void> {
  if (ids.length === 0) return;
  const { target, auth } = harperConfig();
  if (target) {
    for (const id of ids) {
      const res = await fetch(`${target}/Firm/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` },
      });
      if (![200, 202, 204, 404].includes(res.status)) {
        throw new Error(`DELETE Firm/${id} -> HTTP ${res.status}`);
      }
    }
    return;
  }

  const quoted = ids.map(id => `'${id.replaceAll("'", "''")}'`).join(", ");
  await op({
    operation: "sql",
    sql: `DELETE FROM data.Firm WHERE id IN (${quoted})`,
  });
}

/**
 * Runs the curated alias merge in dry-run mode unless --write is supplied.
 * @returns Resolves after reporting candidates and optionally persisting the merge.
 */
async function main(): Promise<void> {
  const write = has("--write");
  const rows = await loadRows();
  const plan = buildFirmMergePlan(rows);

  console.log(
    `[merge-firm-aliases] target: ${arg(SEED_FILE_ARG) ?? describeTarget()}`
  );
  console.log(`  curated merges: ${plan.deleteFirmIds.length}`);
  console.log(`  duplicate candidate groups: ${plan.candidateGroups.length}`);
  for (const group of plan.candidateGroups) {
    console.log(
      `  candidate ${group.normalizedName}: ${group.firms.map(f => f.name).join(" | ")}`
    );
  }

  if (!write) {
    console.log(
      "  dry-run only; pass --write to persist upserts and delete merged Firm rows"
    );
    return;
  }

  await writeRows(plan.rows);
  if (!arg(SEED_FILE_ARG)) await deleteFirmRows(plan.deleteFirmIds);
  console.log("  merge complete");
}

await main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
