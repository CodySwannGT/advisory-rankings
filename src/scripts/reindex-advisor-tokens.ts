#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  createHarperOpAdvisorSearchIndexHandle,
  reindexAdvisorTokens,
} from "../lib/advisor-search-index.js";

const main = async (): Promise<void> => {
  const ids = process.argv.slice(2).filter(Boolean);
  if (ids.length === 0) {
    console.error(
      "usage: bun run src/scripts/reindex-advisor-tokens.ts <advisorId> [...]"
    );
    process.exitCode = 1;
    return;
  }
  const summary = await reindexAdvisorTokens(
    createHarperOpAdvisorSearchIndexHandle(),
    ids
  );
  console.log(
    `[reindex] advisors=${ids.length} added=${summary.added} removed=${summary.removed}`
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
