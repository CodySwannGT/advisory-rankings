#!/usr/bin/env node
// @ts-nocheck
import seedData from "../data/seed-data.json" with { type: "json" };
import { basicAuth, requiredEnv, restPut } from "../lib/rest.js";

const base = requiredEnv("HDB_TARGET_URL");
const auth = basicAuth(requiredEnv("HDB_ADMIN_USERNAME"), requiredEnv("HDB_ADMIN_PASSWORD"));

console.error(`[seed_via_rest] target: REST ${base}`);

for (const [table, records] of Object.entries(seedData)) {
  let touched = 0;
  for (const record of records as Record<string, unknown>[]) {
    if (await restPut(base, table, record, auth)) touched++;
  }
  console.log(`  upsert ${table}: ${(records as unknown[]).length} (${touched} touched)`);
}

console.log("\nseed complete");
