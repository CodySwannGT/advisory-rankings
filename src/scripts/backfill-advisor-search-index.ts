#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  createHarperOpAdvisorSearchIndexHandle,
  reindexAdvisorTokens,
} from "../lib/advisor-search-index.js";
import { describeTarget, sql } from "../lib/harper.js";

const BATCH_SIZE = 500;
const handle = createHarperOpAdvisorSearchIndexHandle();

/**
 *
 */
interface Totals {
  readonly added: number;
  readonly removed: number;
}

const fetchIdBatch = async (offset: number): Promise<readonly string[]> => {
  const rows = await sql(
    `SELECT id FROM data.Advisor ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}`
  );
  return rows.map(r => (typeof r.id === "string" ? r.id : "")).filter(Boolean);
};

const reindexBatch = async (
  offset: number,
  batchIndex: number,
  totals: Totals
): Promise<Totals> => {
  const start = Date.now();
  const ids = await fetchIdBatch(offset);
  if (ids.length === 0) return totals;
  const summary = await reindexAdvisorTokens(handle, ids);
  const elapsedMs = Date.now() - start;
  const next: Totals = {
    added: totals.added + summary.added,
    removed: totals.removed + summary.removed,
  };
  console.log(
    `[backfill] batch ${batchIndex} offset=${offset} ids=${ids.length} added=${summary.added} removed=${summary.removed} elapsed=${elapsedMs}ms`
  );
  if (ids.length < BATCH_SIZE) return next;
  return reindexBatch(offset + BATCH_SIZE, batchIndex + 1, next);
};

const main = async (): Promise<void> => {
  const target = describeTarget();
  const totals = await reindexBatch(0, 1, { added: 0, removed: 0 });
  console.log(
    `[backfill] done target=${target} added=${totals.added} removed=${totals.removed}`
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
