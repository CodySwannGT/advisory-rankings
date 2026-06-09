#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { describeTarget } from "../lib/harper.js";
import { runRecruitingArticleBackfill } from "../lib/recruiting-article-backfill.js";

const opt = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const positiveIntegerOpt = (name: string): number => {
  const value = Number(opt(name));
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
};

const main = async (): Promise<void> => {
  const dryRun = !process.argv.includes("--write");
  const limit = positiveIntegerOpt("--limit");
  const sourceDir = opt("--source-dir");
  const artifactPath = opt("--artifact");
  const target = describeTarget();
  const summary = await runRecruitingArticleBackfill({
    sourceDir,
    artifactPath,
    limit,
    dryRun,
  });
  console.error(
    `[backfill_recruiting_articles] mode: ${dryRun ? "dry-run" : "write"}`
  );
  console.error(`[backfill_recruiting_articles] target: ${target}`);
  console.log(JSON.stringify(summary, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
