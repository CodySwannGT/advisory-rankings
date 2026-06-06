#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { articleDates } from "../lib/article-dates.js";
import { describeTarget, sql, upsert } from "../lib/harper.js";

const BATCH_SIZE = 500;

/**
 *
 */
type ArticleBackfillRow = Readonly<
  Record<string, unknown> & Partial<Record<"id", unknown>>
>;

/**
 *
 */
interface Totals {
  readonly scanned: number;
  readonly repaired: number;
}

const missingPublishedDateQuery = (): string => `
SELECT *
FROM data.Article
WHERE publishedDate IS NULL OR publishedDate = '' OR publishedDate = 'undefined'
ORDER BY id
LIMIT ${BATCH_SIZE}
`;

const rowId = (row: ArticleBackfillRow): string =>
  typeof row.id === "string" ? row.id : "";

const repairRow = (row: ArticleBackfillRow, now: Date): ArticleBackfillRow => ({
  ...row,
  ...articleDates(
    {
      publishedDate: row.publishedDate,
      modifiedDate: row.modifiedDate,
      crawledAt: row.crawledAt,
      fetchedAt: row.fetchedAt,
      loadedAt: row.loadedAt,
    },
    now
  ),
});

const backfillBatch = async (
  batch: number,
  totals: Totals,
  now: Date
): Promise<Totals> => {
  const rows = await sql<ArticleBackfillRow>(missingPublishedDateQuery());
  if (rows.length === 0) return totals;
  const repairs = rows
    .filter(row => rowId(row))
    .map(row => repairRow(row, now));
  if (repairs.length === 0)
    throw new Error("Article backfill found rows missing id; cannot repair");
  const touched = await upsert("Article", repairs);
  const next = {
    scanned: totals.scanned + rows.length,
    repaired: totals.repaired + touched,
  };
  console.log(
    `[article-published-date-backfill] batch ${batch} scanned=${rows.length} repaired=${touched}`
  );
  if (rows.length < BATCH_SIZE) return next;
  return backfillBatch(batch + 1, next, now);
};

const main = async (): Promise<void> => {
  const totals = await backfillBatch(
    1,
    { scanned: 0, repaired: 0 },
    new Date()
  );
  console.log(
    `[article-published-date-backfill] done target=${describeTarget()} scanned=${totals.scanned} repaired=${totals.repaired}`
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
