#!/usr/bin/env node
// @ts-nocheck
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyRaymondJamesRows,
  parseRaymondJamesBranchMarkdown,
  RAYMOND_JAMES_MANHATTAN_BRANCH_URL,
  RAYMOND_JAMES_SOURCE_ADAPTER,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type RaymondJamesAdvisorSource,
  type RaymondJamesRows,
} from "../lib/raymond-james.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** Harper tables written by the Raymond James scraper. */
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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof RaymondJamesRows>;
const FABRIC_UPSERT_BATCH_SIZE = 100;
const FABRIC_UPSERT_RETRIES = 3;
const FETCH_TIMEOUT_MS = 15000;

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Reads the option value after a CLI flag.
 *
 * @param name - CLI flag name to read.
 * @returns The flag value, when present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Checks whether a CLI flag is present.
 *
 * @param name - CLI flag name to test.
 * @returns True when the flag exists.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Reads a numeric CLI option.
 *
 * @param name - CLI flag name to read.
 * @param fallback - Value used when the flag is absent.
 * @returns Parsed numeric flag value or fallback.
 */
function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

/**
 * Reads Raymond James search inputs from repeated or CSV query flags.
 *
 * @returns Search inputs for the Raymond James finder.
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

/** Runs the Raymond James branch-roster scraper and optionally writes rows. */
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
  if (options.json) {
    console.log(
      JSON.stringify({ write: options.write, counts, rows }, null, 2)
    );
    return;
  }
  console.log(
    `[raymond-james] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
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
  pageSize: numberArg("--page-size", DEFAULT_FIRM_SOURCE_PAGE_SIZE),
  checkedAt: arg("--checked-at") ?? new Date().toISOString().slice(0, 10),
  queries: queryInputs(),
});

const collectRows = async (
  inputs: ReadonlyArray<string>,
  maxAdvisors: number,
  checkedAt: string
): Promise<RaymondJamesRows> => {
  return await inputs.reduce<Promise<RaymondJamesRows>>(
    async (previous, input) => {
      console.error(
        `[raymond-james] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
      );
      const advisors = await fetchAdvisors(input, maxAdvisors);
      return mergeRows(
        await previous,
        RAYMOND_JAMES_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
      );
    },
    Promise.resolve(emptyRaymondJamesRows())
  );
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number
): Promise<ReadonlyArray<RaymondJamesAdvisorSource>> => {
  const branchUrl = resolveBranchUrl(input);
  if (!branchUrl) {
    console.error(
      `[raymond-james] unsupported input ${JSON.stringify(input)}; pass a Raymond James branch URL or use the 10022 sample.`
    );
    return [];
  }
  const markdown = await fetchBranchMarkdown(branchUrl);
  return parseRaymondJamesBranchMarkdown(markdown, branchUrl).slice(
    0,
    maxAdvisors
  );
};

const resolveBranchUrl = (input: string): string | undefined => {
  if (/^https?:\/\/(?:www\.)?raymondjames\.com\//iu.test(input)) {
    return input;
  }
  const normalized = input.trim().toLowerCase();
  if (["10022", "new york", "new york, ny", "manhattan"].includes(normalized)) {
    return RAYMOND_JAMES_MANHATTAN_BRANCH_URL;
  }
  return undefined;
};

const fetchBranchMarkdown = async (branchUrl: string): Promise<string> => {
  try {
    return await fetchText(branchUrl);
  } catch (error) {
    console.error(
      `[raymond-james] direct fetch failed, using public markdown fallback: ${String(error)}`
    );
    return fetchText(readerUrl(branchUrl));
  }
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: requestHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Raymond James returned HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const readerUrl = (url: string): string =>
  `https://r.jina.ai/http://${url.replace(/^https?:\/\//iu, "")}`;

const requestHeaders = (): Record<string, string> => ({
  accept: "text/html,text/markdown,application/xhtml+xml",
  referer: RAYMOND_JAMES_SOURCE_ADAPTER.discover().locatorUrl,
  "user-agent": "Mozilla/5.0 advisory-rankings Raymond James scraper",
});

const mergeRows = (
  left: RaymondJamesRows,
  right: RaymondJamesRows
): RaymondJamesRows => {
  return Object.fromEntries(
    TABLE_ORDER.map(table => [
      table,
      [
        ...new Map(
          [...left[table], ...right[table]].map(row => [String(row.id), row])
        ).values(),
      ],
    ])
  ) as RaymondJamesRows;
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
