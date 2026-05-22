#!/usr/bin/env node
import seedData from "../data/seed-data.json" with { type: "json" };
import { basicAuth, requiredEnv, restPut } from "../lib/rest.js";

const base = requiredEnv("HDB_TARGET_URL");
const auth = basicAuth(
  requiredEnv("HDB_ADMIN_USERNAME"),
  requiredEnv("HDB_ADMIN_PASSWORD")
);

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
