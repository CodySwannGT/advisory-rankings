#!/usr/bin/env node
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyStifelRows,
  parseStifelSearchResults,
  STIFEL_SOURCE_ADAPTER,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type StifelAdvisorSource,
  type StifelRows,
} from "../lib/stifel.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** Harper tables written by the Stifel scraper. */
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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof StifelRows>;
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
 * Reads Stifel search inputs from repeated or CSV query flags.
 * @returns Search inputs sent to the public search page.
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
  return queries.length ? queries : csv?.length ? csv : ["ny"];
}

/**
 * Runs the Stifel search scraper and optionally writes mapped rows.
 * @returns Resolves after selected query inputs are fetched and reported.
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
      `[stifel] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
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
  rows: StifelRows,
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
  pageSize: numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<StifelRows> => {
  return await inputs.reduce<Promise<StifelRows>>(async (previous, input) => {
    console.error(
      `[stifel] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
    );
    const advisors = await fetchAdvisors(input, maxAdvisors, pageSize);
    return mergeRows(
      await previous,
      STIFEL_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
    );
  }, Promise.resolve(emptyStifelRows()));
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<StifelAdvisorSource>> => {
  const searchUrl = STIFEL_SOURCE_ADAPTER.buildSearchUrl(input, pageSize, 0);
  const html = await fetchHtml(searchUrl);
  return parseStifelSearchResults(html, searchUrl).slice(0, maxAdvisors);
};

const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 advisory-rankings Stifel scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Stifel search returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return response.text();
};

const dedupeRows = (
  left: ReadonlyArray<Record<string, unknown>>,
  right: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> => [
  ...new Map([...left, ...right].map(row => [String(row["id"]), row])).values(),
];

const mergeRows = (left: StifelRows, right: StifelRows): StifelRows => ({
  Firm: dedupeRows(left.Firm, right.Firm),
  FirmAlias: dedupeRows(left.FirmAlias, right.FirmAlias),
  Branch: dedupeRows(left.Branch, right.Branch),
  Advisor: dedupeRows(left.Advisor, right.Advisor),
  EmploymentHistory: dedupeRows(
    left.EmploymentHistory,
    right.EmploymentHistory
  ),
  Designation: dedupeRows(left.Designation, right.Designation),
  Team: dedupeRows(left.Team, right.Team),
  TeamMembership: dedupeRows(left.TeamMembership, right.TeamMembership),
  AdvisorResearchCheck: dedupeRows(
    left.AdvisorResearchCheck,
    right.AdvisorResearchCheck
  ),
});

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
