#!/usr/bin/env node
import {
  buildMorganStanleySearchUrl,
  emptyMorganStanleyRows,
  mapMorganStanleyLocations,
  type MorganStanleyRows,
  type MorganStanleyYextLocation,
} from "../lib/morgan-stanley.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

interface YextResponse {
  readonly response?: {
    readonly resultsCount?: number;
    readonly results?: ReadonlyArray<{ readonly data?: MorganStanleyYextLocation }>;
  };
}

const TABLE_ORDER = [
  "Firm",
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function numberArg(name: string, fallback: number): number {
  const value = arg(name);
  return value ? Number(value) : fallback;
}

function queryInputs(): string[] {
  const queries = process.argv
    .map((value, index) => (value === "--query" ? process.argv[index + 1] : undefined))
    .filter((value): value is string => value !== undefined);
  const csv = arg("--queries")
    ?.split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return queries.length ? queries : csv?.length ? csv : [""];
}

async function fetchLocations(input: string, maxAdvisors: number, pageSize: number): Promise<MorganStanleyYextLocation[]> {
  const locations: MorganStanleyYextLocation[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (locations.length < maxAdvisors && offset < total && offset < MAX_YEXT_OFFSET_LIMIT) {
    const remainingYextWindow = MAX_YEXT_OFFSET_LIMIT - offset;
    const limit = Math.min(pageSize, maxAdvisors - locations.length, remainingYextWindow);
    const json = await fetchJson(buildMorganStanleySearchUrl({ input, limit, offset }));
    total = json.response?.resultsCount ?? 0;
    const results = json.response?.results ?? [];
    if (results.length === 0) break;
    for (const result of results) {
      const data = result.data;
      const key = data?.uid ?? data?.id;
      if (!data || !key || seen.has(key)) continue;
      seen.add(key);
      locations.push(data);
      if (locations.length >= maxAdvisors) break;
    }
    offset += results.length;
  }

  return locations;
}

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
    throw new Error(`Morgan Stanley Yext feed returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return (await response.json()) as YextResponse;
}

function targetUrl(): string | undefined {
  const value = process.env.HDB_TARGET_URL ?? loadCreds().clusterUrl;
  return value ? value.replace(/\/+$/, "") : undefined;
}

async function studio(): Promise<StudioSession> {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
}

async function fabricUpsert(table: string, records: ReadonlyArray<Record<string, unknown>>): Promise<number> {
  if (records.length === 0) return 0;
  const creds = loadCreds();
  const session = await studio();
  let touched = 0;
  for (let index = 0; index < records.length; index += FABRIC_UPSERT_BATCH_SIZE) {
    const batch = records.slice(index, index + FABRIC_UPSERT_BATCH_SIZE);
    const response = await retryFabricUpsert(() =>
      session.clusterOp(creds.clusterId, "upsert", {
        database: "data",
        table,
        records: batch,
      })
    );
    const body = response.body as Partial<Record<"upserted_hashes", ReadonlyArray<unknown>>>;
    touched += Array.isArray(body.upserted_hashes) ? body.upserted_hashes.length : batch.length;
  }
  return touched;
}

async function retryFabricUpsert(
  operation: () => Promise<{ readonly status: number; readonly body: unknown }>
): Promise<{ readonly status: number; readonly body: unknown }> {
  let last: { readonly status: number; readonly body: unknown } | undefined;
  for (let attempt = 1; attempt <= FABRIC_UPSERT_RETRIES; attempt += 1) {
    last = await operation();
    if (last.status === 200) return last;
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
  throw new Error(`Fabric upsert failed: ${last?.status} ${JSON.stringify(last?.body).slice(0, 300)}`);
}

async function writeRows(table: string, records: ReadonlyArray<Record<string, unknown>>): Promise<number> {
  if (targetUrl()) return fabricUpsert(table, records);
  return upsert(table, [...records]);
}

function mergeRows(left: MorganStanleyRows, right: MorganStanleyRows): MorganStanleyRows {
  return Object.fromEntries(
    TABLE_ORDER.map(table => {
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of [...left[table], ...right[table]]) byId.set(String(row.id), row);
      return [table, [...byId.values()]];
    })
  ) as unknown as MorganStanleyRows;
}

async function main(): Promise<void> {
  const write = has("--write");
  const maxAdvisors = numberArg("--max-advisors", 100);
  const pageSize = Math.min(numberArg("--page-size", 50), 50);
  const checkedAt = arg("--checked-at") ?? new Date().toISOString().slice(0, 10);
  let rows = emptyMorganStanleyRows();

  for (const input of queryInputs()) {
    console.error(`[morgan-stanley] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`);
    const locations = await fetchLocations(input, maxAdvisors, pageSize);
    rows = mergeRows(rows, mapMorganStanleyLocations(locations, checkedAt));
  }

  const counts = Object.fromEntries(TABLE_ORDER.map(table => [table, rows[table].length]));
  if (has("--json")) {
    console.log(JSON.stringify({ write, counts, rows }, null, 2));
    return;
  }

  console.log(`[morgan-stanley] target: ${write ? targetUrl() ?? describeTarget() : "dry-run"}`);
  for (const table of TABLE_ORDER) {
    const tableRows = rows[table] as Record<string, unknown>[];
    const touched = write ? await writeRows(table, tableRows) : tableRows.length;
    console.log(`  ${write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${write ? "touched" : "mapped"})`);
  }
}

await main();
