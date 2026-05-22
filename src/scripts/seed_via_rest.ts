#!/usr/bin/env node
// @ts-nocheck
import seedData from "../data/seed-data.json" with { type: "json" };
import { harperConfig } from "../lib/harper.js";
import { restPut } from "../lib/rest.js";

const config = harperConfig();
const base = config.target;
const auth = `Basic ${config.auth}`;

if (!base) throw new Error("Harper REST target is required");

console.error(`[seed_via_rest] target: REST ${base}`);

for (const [table, records] of Object.entries(seedData)) {
  let touched = 0;
  for (const record of records as Record<string, unknown>[]) {
    if (await restPut(base, table, record, auth)) touched++;
  }
  console.log(`  upsert ${table}: ${(records as unknown[]).length} (${touched} touched)`);
}

console.log("\nseed complete");
