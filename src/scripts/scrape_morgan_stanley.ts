#!/usr/bin/env node
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyMorganStanleyRows,
  mapMorganStanleyLocations,
  mergeMorganStanleyRows,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type MorganStanleyRows,
} from "../lib/morgan-stanley.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";
import {
  arg,
  batches,
  has,
  numberArg,
  queryInputs,
  stripTrailingSlashes,
  type FabricResponse,
} from "./scrape_morgan_stanley_helpers.js";
import { fetchLocations } from "./scrape_morgan_stanley_fetcher.js";

const TABLE_ORDER = [
  "Firm",
  "FirmAlias",
  "Branch",
  "Advisor",
  "EmploymentHistory",
  "Designation",
  "Team",
  "TeamMembership",
  "AdvisorResearchCheck",
] as const satisfies ReadonlyArray<FirmSourceTable & keyof MorganStanleyRows>;
const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Resolves the configured Harper cluster URL, if any.
 * @returns The cluster URL with any trailing slashes removed, or undefined.
 */
function targetUrl(): string | undefined {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  const value = env.HDB_TARGET_URL ?? loadCreds().clusterUrl;
  return value ? stripTrailingSlashes(value) : undefined;
}

/**
 * Lazily logs into a Harper Studio session and caches the promise.
 * @returns A resolved Studio session ready for cluster ops.
 */
async function studio(): Promise<StudioSession> {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
}

/**
 * Upserts records to a Harper table via the Fabric Studio cluster API.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @returns The number of records reported as upserted.
 */
async function fabricUpsert(
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> {
  if (records.length === 0) return 0;
  const creds = loadCreds();
  const session = await studio();
  return await batches(records, FABRIC_UPSERT_BATCH_SIZE).reduce<
    Promise<number>
  >(async (previous, batch) => {
    const response = await retryFabricUpsert(() =>
      session.clusterOp(creds.clusterId, "upsert", {
        database: "data",
        table,
        records: batch,
      })
    );
    const body = response.body as Partial<
      Record<"upserted_hashes", ReadonlyArray<unknown>>
    >;
    return (
      (await previous) +
      (Array.isArray(body.upserted_hashes)
        ? body.upserted_hashes.length
        : batch.length)
    );
  }, Promise.resolve(0));
}

/**
 * Retries a Fabric upsert until it succeeds or the retry budget is exhausted.
 * @param operation - Operation callback to retry.
 * @param attempt - One-based retry attempt counter.
 * @returns Final successful Fabric response.
 */
async function retryFabricUpsert(
  operation: () => Promise<FabricResponse>,
  attempt = 1
): Promise<FabricResponse> {
  const result = await operation();
  if (result.status === 200) return result;
  if (attempt >= FABRIC_UPSERT_RETRIES) {
    throw new Error(
      `Fabric upsert failed: ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`
    );
  }
  await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  return retryFabricUpsert(operation, attempt + 1);
}

/**
 * Writes mapped rows to either the Fabric cluster or local Harper target.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @returns The number of records persisted.
 */
async function writeRows(
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> {
  if (targetUrl()) return fabricUpsert(table, records);
  return upsert(table, [...records]);
}

/**
 * Runs the Morgan Stanley locator scraper and optionally writes mapped rows.
 * @returns Resolves after all selected query inputs are fetched and reported.
 */
async function main(): Promise<void> {
  const options = runOptions();
  const rows = await collectRows(
    options.queries,
    options.maxAdvisors,
    options.pageSize,
    options.checkedAt
  );

  const counts = Object.fromEntries(
    TABLE_ORDER.map(table => [table, rows[table].length])
  );
  if (!options.json) {
    console.log(
      `[morgan-stanley] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
    );
  }
  const touchedCounts = Object.fromEntries(
    await Promise.all(
      TABLE_ORDER.map(async table => touchTable(table, rows, options))
    )
  );
  if (options.json) {
    console.log(
      JSON.stringify(
        { write: options.write, counts, touchedCounts, rows },
        null,
        2
      )
    );
  }
}

const touchTable = async (
  table: (typeof TABLE_ORDER)[number],
  rows: MorganStanleyRows,
  options: FirmSourceRunOptions
): Promise<readonly [string, number]> => {
  const tableRows = rows[table] as readonly Record<string, unknown>[];
  const touched = options.write
    ? await writeRows(table, tableRows)
    : tableRows.length;
  if (!options.json) {
    console.log(
      `  ${options.write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${options.write ? "touched" : "mapped"})`
    );
  }
  return [table, touched] as const;
};

const runOptions = (): FirmSourceRunOptions => ({
  write: has("--write"),
  json: has("--json"),
  maxAdvisors: numberArg("--max-advisors", DEFAULT_FIRM_SOURCE_MAX_ADVISORS),
  pageSize: Math.min(
    numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
    DEFAULT_FIRM_SOURCE_PAGE_SIZE
  ),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const logAndFetchLocations = (
  input: string,
  maxAdvisors: number,
  pageSize: number
): ReturnType<typeof fetchLocations> => {
  console.error(
    `[morgan-stanley] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
  );
  return fetchLocations(input, maxAdvisors, pageSize);
};

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<MorganStanleyRows> => {
  return await inputs.reduce<Promise<MorganStanleyRows>>(
    async (previous, input) => {
      const locations = await logAndFetchLocations(
        input,
        maxAdvisors,
        pageSize
      );
      return mergeMorganStanleyRows(
        await previous,
        mapMorganStanleyLocations(locations, checkedAt)
      );
    },
    Promise.resolve(emptyMorganStanleyRows())
  );
};

await main();
