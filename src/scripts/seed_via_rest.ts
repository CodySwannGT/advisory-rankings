#!/usr/bin/env node
import seedData from "../data/seed-data.json" with { type: "json" };
import { harperConfig } from "../lib/harper.js";
import { restPut } from "../lib/rest.js";

const config = harperConfig();
const base = config.target;
const auth = `Basic ${config.auth}`;

if (!base) throw new Error("Harper REST target is required");

console.error(`[seed_via_rest] target: REST ${base}`);

for (const [table, records] of Object.entries(seedData)) {
  const rows = records as ReadonlyArray<Record<string, unknown>>;
  const results = await Promise.all(
    rows.map(record => restPut(base, table, record, auth))
  );
  const touched = results.filter(Boolean).length;
  console.log(`  upsert ${table}: ${rows.length} (${touched} touched)`);
}

console.log("\nseed complete");
