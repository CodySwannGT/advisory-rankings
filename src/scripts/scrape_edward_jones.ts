#!/usr/bin/env node
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  EDWARD_JONES_SEARCH_REFERER,
  EDWARD_JONES_SOURCE_ADAPTER,
  emptyEdwardJonesRows,
  type EdwardJonesAdvisorSource,
  type EdwardJonesRows,
  type EdwardJonesSearchResponse,
  type FirmSourceRunOptions,
  type FirmSourceTable,
} from "../lib/edward-jones.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** Harper tables written by the Edward Jones scraper. */
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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof EdwardJonesRows>;
const DEFAULT_SEARCH_TYPE = 2;
const EDWARD_JONES_PAGE_SIZE = 16;
const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Reads the option value after a CLI flag.
 * @param name - CLI flag name to read.
 * @returns The flag value, when present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Checks whether a CLI flag is present.
 * @param name - CLI flag name to test.
 * @returns True when the flag exists.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Reads a numeric CLI option.
 * @param name - CLI flag name to read.
 * @param fallback - Value used when the flag is absent.
 * @returns Parsed numeric flag value or fallback.
 */
function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Reads Edward Jones search inputs from repeated or CSV query flags.
 * @returns Search inputs for the Edward Jones finder.
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
  return queries.length ? queries : csv?.length ? csv : ["10022"];
}

/** Runs the Edward Jones advisor-results scraper and optionally writes rows. */
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
  if (options.json) {
    console.log(
      JSON.stringify({ write: options.write, counts, rows }, null, 2)
    );
    return;
  }
  console.log(
    `[edward-jones] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
  );
  for (const table of TABLE_ORDER) {
    const tableRows = rows[table] as readonly Record<string, unknown>[];
    const touched = options.write
      ? await writeRows(table, tableRows)
      : tableRows.length;
    console.log(
      `  ${options.write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${options.write ? "touched" : "mapped"})`
    );
  }
}

const runOptions = (): FirmSourceRunOptions => ({
  write: has("--write"),
  json: has("--json"),
  maxAdvisors: numberArg("--max-advisors", DEFAULT_FIRM_SOURCE_MAX_ADVISORS),
  pageSize: Math.min(
    numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
    EDWARD_JONES_PAGE_SIZE
  ),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<EdwardJonesRows> => {
  return await inputs.reduce<Promise<EdwardJonesRows>>(
    async (previous, input) => {
      console.error(
        `[edward-jones] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
      );
      const advisors = await fetchAdvisors(input, maxAdvisors, pageSize);
      return mergeRows(
        await previous,
        EDWARD_JONES_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
      );
    },
    Promise.resolve(emptyEdwardJonesRows())
  );
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<EdwardJonesAdvisorSource>> => {
  const pages = Math.max(1, Math.ceil(maxAdvisors / pageSize));
  return collectAdvisorPages(input, pageSize, maxAdvisors, pages);
};

const collectAdvisorPages = async (
  input: string,
  pageSize: number,
  maxAdvisors: number,
  maxPages: number,
  page = 1,
  collected: ReadonlyArray<EdwardJonesAdvisorSource> = []
): Promise<ReadonlyArray<EdwardJonesAdvisorSource>> => {
  if (page > maxPages || collected.length >= maxAdvisors) {
    return collected.slice(0, maxAdvisors);
  }
  const response = await fetchSearchPage(input, page, pageSize);
  const nextCollected = [...collected, ...(response.results ?? [])];
  const total = response.resultCount ?? nextCollected.length;
  if (nextCollected.length >= total) {
    return nextCollected.slice(0, maxAdvisors);
  }
  return collectAdvisorPages(
    input,
    pageSize,
    maxAdvisors,
    maxPages,
    page + 1,
    nextCollected
  );
};

const fetchSearchPage = async (
  input: string,
  page: number,
  pageSize: number
): Promise<EdwardJonesSearchResponse> => {
  const searchUrl = EDWARD_JONES_SOURCE_ADAPTER.buildSearchUrl(
    input,
    pageSize,
    (page - 1) * pageSize
  );
  const response = await fetch(searchUrl, { headers: requestHeaders(input) });
  if (!response.ok) {
    throw new Error(
      `Edward Jones locator returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as EdwardJonesSearchResponse;
};

const requestHeaders = (input: string): Record<string, string> => ({
  accept: "application/json, text/plain, */*",
  referer: `${EDWARD_JONES_SEARCH_REFERER}?fasearch=${encodeURIComponent(input)}&searchtype=${DEFAULT_SEARCH_TYPE}`,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) advisory-rankings Edward Jones scraper",
});

const dedupeRows = (
  left: ReadonlyArray<Record<string, unknown>>,
  right: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> => [
  ...new Map([...left, ...right].map(row => [String(row["id"]), row])).values(),
];

const mergeRows = (
  left: EdwardJonesRows,
  right: EdwardJonesRows
): EdwardJonesRows => ({
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
    return (await previous) + touchedCount(response);
  }, Promise.resolve(0));
};

const retryFabricUpsert = async (
  operation: () => Promise<FabricResponse>,
  attempt = 1
): Promise<FabricResponse> => {
  try {
    return await operation();
  } catch (error) {
    if (attempt >= FABRIC_UPSERT_RETRIES) throw error;
    await sleep(250 * attempt);
    return retryFabricUpsert(operation, attempt + 1);
  }
};

const writeRows = async (
  table: string,
  rows: ReadonlyArray<Record<string, unknown>>
): Promise<number> => {
  const target = targetUrl();
  return target ? upsert(table, [...rows]) : fabricUpsert(table, rows);
};

const batches = <T>(
  items: ReadonlyArray<T>,
  size: number
): ReadonlyArray<ReadonlyArray<T>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );

const touchedCount = (response: FabricResponse): number => {
  const body = response.body;
  if (Array.isArray(body)) return body.length;
  if (typeof body === "object" && body && "inserted_hashes" in body) {
    return Array.isArray(body.inserted_hashes)
      ? body.inserted_hashes.length
      : 0;
  }
  return 0;
};

const stripTrailingSlashes = (value: string): string =>
  value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
