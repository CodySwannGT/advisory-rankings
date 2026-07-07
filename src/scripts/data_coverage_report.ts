#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  buildDataCoverageReport,
  type CoverageQuery,
} from "../lib/data-coverage-report.js";
import { renderDataCoverageReport } from "../lib/data-coverage-render.js";
import { describeTarget, sql } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Read the configured deployed target marker, when present.
 * @returns Normalized target URL or undefined for local Harper.
 */
function targetUrl(): string | undefined {
  const value = process.env.HDB_TARGET_URL;
  if (!value) return undefined;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Create or reuse a Studio session for deployed Fabric reads.
 * @returns Authenticated Studio session.
 */
async function studio(): Promise<StudioSession> {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
}

/**
 * Run SQL through Fabric's control-plane operations proxy.
 * @param sqlText SQL query text.
 * @returns SQL rows.
 */
async function fabricSql<T extends Readonly<Record<string, unknown>>>(
  sqlText: string
): Promise<ReadonlyArray<T>> {
  const creds = loadCreds();
  const session = await studio();
  const response = await session.clusterOp(creds.clusterId, "sql", {
    sql: sqlText,
  });
  if (response.status !== 200) {
    throw new Error(
      `Fabric sql failed: ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`
    );
  }
  if (Array.isArray(response.body)) return response.body as ReadonlyArray<T>;
  const wrapped = response.body as Partial<Record<"data", ReadonlyArray<T>>>;
  return wrapped.data ?? [];
}

/**
 * Select the SQL reader for local or deployed runs.
 * @returns Runtime SQL query function.
 */
function runtimeQuery(): CoverageQuery {
  return targetUrl() ? fabricSql : sql;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const strict = process.argv.includes("--strict");
  await buildDataCoverageReport(runtimeQuery())
    .then(report => {
      const gap = report.unextractedRecruitingArticles;
      console.log(renderDataCoverageReport(report, describeTarget()));
      if (strict && gap.length > 0) {
        console.error(
          `[data-coverage] --strict: ${gap.length} recruiting-shaped article(s) have no linked move`
        );
        process.exitCode = 1;
      }
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
