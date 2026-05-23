#!/usr/bin/env node
// @ts-nocheck
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyMerrillRows,
  MERRILL_SOURCE_ADAPTER,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type MerrillRows,
  type MerrillYextAdvisor,
} from "../lib/merrill.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Yext response envelope returned by Merrill's public locator API. */
interface YextResponse {
  readonly [key: string]: unknown;
}

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** One fetched Yext page plus its total result count. */
type AdvisorPage = Readonly<Record<"total" | "results", unknown>>;

/** Pagination accumulator used while walking the Yext result window. */
type AdvisorPageState = Readonly<Record<string, unknown>>;

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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof MerrillRows>;
const MAX_YEXT_OFFSET_LIMIT = 10_000;
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
 * Reads Merrill search inputs from repeated `--query` or comma-separated `--queries`.
 * @returns Search inputs sent to the public locator feed.
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
 * Runs the Merrill locator scraper and optionally writes mapped rows.
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

  if (options.json) {
    console.log(
      JSON.stringify({ write: options.write, counts, rows }, null, 2)
    );
    return;
  }

  console.log(
    `[merrill] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
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
    DEFAULT_FIRM_SOURCE_PAGE_SIZE
  ),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  pageSize: number,
  checkedAt: string
): Promise<MerrillRows> => {
  return await inputs.reduce<Promise<MerrillRows>>(async (previous, input) => {
    console.error(
      `[merrill] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
    );
    const advisors = await fetchAdvisors(input, maxAdvisors, pageSize);
    return mergeRows(
      await previous,
      MERRILL_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
    );
  }, Promise.resolve(emptyMerrillRows()));
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number,
  pageSize: number
): Promise<ReadonlyArray<MerrillYextAdvisor>> => {
  return collectAdvisorPages({
    input,
    maxAdvisors,
    pageSize,
    offset: 0,
    total: Number.POSITIVE_INFINITY,
    advisors: [],
    seenKeys: [],
  });
};

const collectAdvisorPages = async (
  state: AdvisorPageState
): Promise<ReadonlyArray<MerrillYextAdvisor>> => {
  if (
    state.advisors.length >= state.maxAdvisors ||
    state.offset >= state.total ||
    state.offset >= MAX_YEXT_OFFSET_LIMIT
  )
    return state.advisors;
  const page = await fetchAdvisorPage(state);
  if (page.results.length === 0) return state.advisors;
  return collectAdvisorPages(mergeAdvisorPage(state, page));
};

const fetchAdvisorPage = async (
  state: AdvisorPageState
): Promise<AdvisorPage> => {
  const limit = Math.min(
    state.pageSize,
    state.maxAdvisors - state.advisors.length,
    MAX_YEXT_OFFSET_LIMIT - state.offset
  );
  const json = await fetchJson(
    MERRILL_SOURCE_ADAPTER.buildSearchUrl(state.input, limit, state.offset)
  );
  return {
    total: json.response?.resultsCount ?? 0,
    results: json.response?.results ?? [],
  };
};

const fetchJson = async (url: string): Promise<YextResponse> => {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      origin: "https://advisor.ml.com",
      referer: "https://advisor.ml.com/search",
      "user-agent": "Mozilla/5.0 advisory-rankings Merrill scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Merrill Yext feed returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  return (await response.json()) as YextResponse;
};

const mergeAdvisorPage = (
  state: AdvisorPageState,
  page: AdvisorPage
): AdvisorPageState => {
  const newAdvisors = page.results
    .map(result => result.data)
    .filter((advisor): advisor is MerrillYextAdvisor => Boolean(advisor))
    .filter(
      advisor =>
        Boolean(advisorKey(advisor)) &&
        !state.seenKeys.includes(advisorKey(advisor))
    )
    .slice(0, state.maxAdvisors - state.advisors.length);
  return {
    ...state,
    total: page.total,
    offset: state.offset + page.results.length,
    advisors: [...state.advisors, ...newAdvisors],
    seenKeys: [
      ...state.seenKeys,
      ...newAdvisors.map(advisorKey).filter(Boolean),
    ],
  };
};

const advisorKey = (advisor: MerrillYextAdvisor): string => {
  return String(advisor.id ?? advisor.uid ?? "");
};

const mergeRows = (left: MerrillRows, right: MerrillRows): MerrillRows => {
  return Object.fromEntries(
    TABLE_ORDER.map(table => [
      table,
      [
        ...new Map(
          [...left[table], ...right[table]].map(row => [String(row.id), row])
        ).values(),
      ],
    ])
  ) as MerrillRows;
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
    throw new Error(
      `Fabric upsert failed: ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`
    );
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
