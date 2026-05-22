#!/usr/bin/env node
// @ts-nocheck
import {
  buildMorganStanleySearchUrl,
  emptyMorganStanleyRows,
  mapMorganStanleyLocations,
  mergeMorganStanleyRows,
  type MorganStanleyRows,
  type MorganStanleyYextLocation,
} from "../lib/morgan-stanley.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Yext response envelope returned by the Morgan Stanley locator API. */
interface YextResponse {
  readonly [key: string]: unknown;
}

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** One fetched Yext page plus its total result count. */
type LocationPage = Readonly<Record<"total" | "results", unknown>>;

/** Pagination accumulator used while walking the Yext result window. */
type LocationPageState = Readonly<Record<string, unknown>>;

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
] as const satisfies ReadonlyArray<keyof MorganStanleyRows>;
const MAX_YEXT_OFFSET_LIMIT = 10_000;
const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Handles arg for this workflow.
 * @param name - Display name or option name.
 * @returns The computed value.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Handles has for this workflow.
 * @param name - Display name or option name.
 * @returns The computed value.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Handles number arg for this workflow.
 * @param name - Display name or option name.
 * @param fallback - Fallback value when no explicit value is supplied.
 * @returns The computed value.
 */
function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Handles query inputs for this workflow.
 * @returns The computed value.
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
  return queries.length ? queries : csv?.length ? csv : [""];
}

/**
 * Fetches unique advisor locations from the Morgan Stanley locator feed.
 * @param input - Locator search input, usually blank or a ZIP/city query.
 * @param maxAdvisors - Maximum advisor rows to fetch.
 * @param pageSize - Number of records requested per page.
 * @returns Deduplicated Yext location rows.
 */
async function fetchLocations(
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<MorganStanleyYextLocation>> {
  return collectLocationPages({
    input,
    maxAdvisors,
    pageSize,
    offset: 0,
    total: Number.POSITIVE_INFINITY,
    locations: [],
    seenKeys: [],
  });
}

/**
 * Fetches json from the remote service.
 * @param url - URL to request or normalize.
 * @returns The loaded result.
 */
async function fetchJson(url: string): Promise<YextResponse> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "client-sdk": "ANSWERS_CORE=2.5.4, ANSWERS_HEADLESS=2.5.2",
      origin: "https://advisor.morganstanley.com",
      referer: "https://advisor.morganstanley.com/",
      "user-agent": "Mozilla/5.0 advisory-rankings Morgan Stanley scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Morgan Stanley Yext feed returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as YextResponse;
}

/**
 * Handles target url for this workflow.
 * @returns The computed value.
 */
function targetUrl(): string | undefined {
  const env = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  const value = env.HDB_TARGET_URL ?? loadCreds().clusterUrl;
  return value ? stripTrailingSlashes(value) : undefined;
}

/**
 * Handles studio for this workflow.
 * @returns The computed value.
 */
async function studio(): Promise<StudioSession> {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
}

/**
 * Handles fabric upsert for this workflow.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @returns The computed value.
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
 * Handles retry fabric upsert for this workflow.
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
 * Writes write rows to the configured Harper target.
 * @param table - Harper table name.
 * @param records - Rows to write.
 * @returns The computed value.
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
  const write = has("--write");
  const maxAdvisors = numberArg("--max-advisors", 100);
  const pageSize = Math.min(numberArg("--page-size", 50), 50);
  const checkedAt =
    arg("--checked-at") ?? new Date().toISOString().slice(0, 10);
  const rows = await collectRows(
    queryInputs(),
    maxAdvisors,
    pageSize,
    checkedAt
  );

  const counts = Object.fromEntries(
    TABLE_ORDER.map(table => [table, rows[table].length])
  );
  if (has("--json")) {
    console.log(JSON.stringify({ write, counts, rows }, null, 2));
    return;
  }

  console.log(
    `[morgan-stanley] target: ${write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
  );
  for (const table of TABLE_ORDER) {
    const tableRows = rows[table] as readonly Record<string, unknown>[];
    const touched = write
      ? await writeRows(table, tableRows)
      : tableRows.length;
    console.log(
      `  ${write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${write ? "touched" : "mapped"})`
    );
  }
}

const collectLocationPages = async (
  state: LocationPageState
): Promise<ReadonlyArray<MorganStanleyYextLocation>> => {
  if (
    state.locations.length >= state.maxAdvisors ||
    state.offset >= state.total ||
    state.offset >= MAX_YEXT_OFFSET_LIMIT
  )
    return state.locations;
  const page = await fetchLocationPage(state);
  if (page.results.length === 0) return state.locations;
  const next = mergeLocationPage(state, page);
  return collectLocationPages(next);
};

const fetchLocationPage = async (
  state: LocationPageState
): Promise<LocationPage> => {
  const remainingYextWindow = MAX_YEXT_OFFSET_LIMIT - state.offset;
  const limit = Math.min(
    state.pageSize,
    state.maxAdvisors - state.locations.length,
    remainingYextWindow
  );
  const json = await fetchJson(
    buildMorganStanleySearchUrl({
      input: state.input,
      limit,
      offset: state.offset,
    })
  );
  return {
    total: json.response?.resultsCount ?? 0,
    results: json.response?.results ?? [],
  };
};

const mergeLocationPage = (
  state: LocationPageState,
  page: LocationPage
): LocationPageState => {
  const newLocations = page.results
    .map(result => result.data)
    .filter((location): location is MorganStanleyYextLocation =>
      Boolean(location)
    )
    .filter(
      location =>
        Boolean(locationKey(location)) &&
        !state.seenKeys.includes(locationKey(location))
    )
    .slice(0, state.maxAdvisors - state.locations.length);
  return {
    ...state,
    total: page.total,
    offset: state.offset + page.results.length,
    locations: [...state.locations, ...newLocations],
    seenKeys: [
      ...state.seenKeys,
      ...newLocations.map(locationKey).filter(Boolean),
    ],
  };
};

const locationKey = (location: MorganStanleyYextLocation): string => {
  return String(location.uid ?? location.id ?? "");
};

const stripTrailingSlashes = (value: string): string => {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
};

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<MorganStanleyRows> => {
  return await inputs.reduce<Promise<MorganStanleyRows>>(
    async (previous, input) => {
      console.error(
        `[morgan-stanley] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
      );
      const locations = await fetchLocations(input, maxAdvisors, pageSize);
      return mergeMorganStanleyRows(
        await previous,
        mapMorganStanleyLocations(locations, checkedAt)
      );
    },
    Promise.resolve(emptyMorganStanleyRows())
  );
};

const batches = (
  records: ReadonlyArray<Record<string, unknown>>,
  size: number
): ReadonlyArray<ReadonlyArray<Record<string, unknown>>> => {
  return records.length
    ? [records.slice(0, size), ...batches(records.slice(size), size)]
    : [];
};

await main();
