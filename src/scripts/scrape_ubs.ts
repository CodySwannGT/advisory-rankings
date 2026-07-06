#!/usr/bin/env node
import {
  buildUbsSearchBody,
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyUbsRows,
  parseUbsSearchResponse,
  UBS_FINDER_PAGE_URL,
  UBS_SEARCH_ENDPOINT_URL,
  UBS_SOURCE_ADAPTER,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type UbsAdvisorEntity,
  type UbsRows,
} from "../lib/ubs.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;
/** Harper row records grouped by UBS table merge helpers. */
type FirmSourceRecords = ReadonlyArray<Readonly<Record<string, unknown>>>;
/** Runtime CLI options after flags and defaults are parsed. */
interface ResolvedFirmSourceRunOptions extends Omit<
  FirmSourceRunOptions,
  "checkedAt" | "json" | "maxAdvisors" | "pageSize" | "queries" | "write"
> {
  readonly checkedAt: string;
  readonly json: boolean;
  readonly maxAdvisors: number;
  readonly pageSize: number;
  readonly queries: ReadonlyArray<string>;
  readonly write: boolean;
}

/** Harper tables written by the UBS scraper. */
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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof UbsRows>;
const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Reads the option value after a CLI flag.
 * @param name - Option name.
 * @returns The option value when present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Checks whether a CLI flag is present.
 * @param name - Option name.
 * @returns True when the flag appears in argv.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Reads a numeric CLI option.
 * @param name - Option name.
 * @param fallback - Fallback value when no explicit value is supplied.
 * @returns Parsed numeric option value.
 */
function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Reads UBS name search inputs from repeated or CSV query flags.
 * @returns Name fragments sent to the public API.
 */
function queryInputs(): readonly string[] {
  const queries = process.argv
    .map((value, index) =>
      value === "--query" ? process.argv[index + 1] : undefined
    )
    .filter((value): value is string => value !== undefined);
  const csv = arg("--queries")
    ?.split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return queries.length ? queries : csv?.length ? csv : ["smith"];
}

/**
 * Runs the UBS locator scraper and optionally writes mapped rows.
 * @returns Resolves after selected query inputs are fetched and reported.
 */
async function main(): Promise<void> {
  const options = runOptions();
  const rows = await collectRows(
    options.queries,
    options.maxAdvisors,
    options.checkedAt
  );
  const counts = Object.fromEntries(
    TABLE_ORDER.map(table => [table, rows[table].length])
  );

  if (!options.json) {
    console.log(
      `[ubs] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
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
  rows: UbsRows,
  options: ResolvedFirmSourceRunOptions
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

const runOptions = (): ResolvedFirmSourceRunOptions => ({
  write: has("--write"),
  json: has("--json"),
  maxAdvisors: numberArg("--max-advisors", DEFAULT_FIRM_SOURCE_MAX_ADVISORS),
  pageSize: numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  checkedAt: string
): Promise<UbsRows> => {
  return await inputs.reduce<Promise<UbsRows>>(async (previous, input) => {
    console.error(
      `[ubs] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
    );
    const advisors = await fetchAdvisors(input, maxAdvisors);
    return mergeRows(
      await previous,
      UBS_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
    );
  }, Promise.resolve(emptyUbsRows()));
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number
): Promise<ReadonlyArray<UbsAdvisorEntity>> => {
  return parseUbsSearchResponse(
    await postSearch(buildUbsSearchBody(input, maxAdvisors))
  ).slice(0, maxAdvisors);
};

const postSearch = async (body: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(UBS_SEARCH_ENDPOINT_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://advisors.ubs.com",
      referer: UBS_FINDER_PAGE_URL,
      "user-agent": "Mozilla/5.0 advisory-rankings UBS scraper",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `UBS search returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`UBS search returned malformed JSON: ${String(error)}`);
  }
};

const mergeRows = (left: UbsRows, right: UbsRows): UbsRows => {
  return {
    Firm: mergeTableRows(left, right, "Firm"),
    FirmAlias: mergeTableRows(left, right, "FirmAlias"),
    Branch: mergeTableRows(left, right, "Branch"),
    Advisor: mergeTableRows(left, right, "Advisor"),
    EmploymentHistory: mergeTableRows(left, right, "EmploymentHistory"),
    Designation: mergeTableRows(left, right, "Designation"),
    Team: mergeTableRows(left, right, "Team"),
    TeamMembership: mergeTableRows(left, right, "TeamMembership"),
    AdvisorResearchCheck: mergeTableRows(left, right, "AdvisorResearchCheck"),
  };
};

const mergeTableRows = (
  left: UbsRows,
  right: UbsRows,
  table: (typeof TABLE_ORDER)[number]
): FirmSourceRecords => {
  return [
    ...new Map(
      [...left[table], ...right[table]].map(row => [String(row.id), row])
    ).values(),
  ];
};

const targetUrl = (): string | undefined => {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  const value = env.HDB_TARGET_URL ?? loadCreds().clusterUrl;
  return value ? stripTrailingSlashes(value) : undefined;
};

const studio = async (): Promise<StudioSession> => {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
};

const fabricUpsert = async (
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> => {
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
    const responseBody = response.body as Partial<
      Record<"upserted_hashes", ReadonlyArray<unknown>>
    >;
    return (
      (await previous) +
      (Array.isArray(responseBody.upserted_hashes)
        ? responseBody.upserted_hashes.length
        : batch.length)
    );
  }, Promise.resolve(0));
};

const retryFabricUpsert = async (
  operation: () => Promise<FabricResponse>,
  attempt = 1
): Promise<FabricResponse> => {
  const result = await operation();
  if (result.status === 200) return result;
  if (attempt >= FABRIC_UPSERT_RETRIES) {
    throw new Error(`Fabric upsert failed: ${result.status}`);
  }
  await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  return retryFabricUpsert(operation, attempt + 1);
};

const writeRows = async (
  table: string,
  records: ReadonlyArray<Record<string, unknown>>
): Promise<number> => {
  if (targetUrl()) return fabricUpsert(table, records);
  return upsert(table, [...records]);
};

const batches = (
  records: ReadonlyArray<Record<string, unknown>>,
  size: number
): ReadonlyArray<ReadonlyArray<Record<string, unknown>>> => {
  return records.length
    ? [records.slice(0, size), ...batches(records.slice(size), size)]
    : [];
};

const stripTrailingSlashes = (value: string): string => {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
};

await main();
