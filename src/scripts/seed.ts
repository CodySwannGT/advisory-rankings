#!/usr/bin/env node
import seedData from "../data/seed-data.json" with { type: "json" };
import { describeTarget, upsert } from "../lib/harper.js";

console.error(`[seed] target: ${describeTarget()}`);

for (const [table, records] of Object.entries(seedData)) {
  const rows = records as ReadonlyArray<Record<string, unknown>>;
  const touched = await upsert(
    table,
    rows.map(row => ({ ...row }))
  );
  console.log(`  upsert ${table}: ${rows.length} (${touched} touched)`);
}

console.log("\nseed complete");
