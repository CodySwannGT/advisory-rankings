#!/usr/bin/env node
import {
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  emptyRbcRows,
  parseRbcAdvisors,
  parseRbcBranches,
  parseRbcNonce,
  RBC_AJAX_ENDPOINT_URL,
  RBC_FINDER_PAGE_URL,
  RBC_SOURCE_ADAPTER,
  type FirmSourceRunOptions,
  type FirmSourceTable,
  type RbcAdvisorSource,
  type RbcBranchSource,
  type RbcRows,
} from "../lib/rbc.js";
import { describeTarget, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";
import { touchFirmSourceTables } from "./firm_source_cli.js";

/** Fabric operation response returned by the Studio cluster API. */
type FabricResponse = Readonly<Record<"status" | "body", unknown>>;

/** Harper tables written by the RBC scraper. */
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
] as const satisfies ReadonlyArray<FirmSourceTable & keyof RbcRows>;
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
 * Reads RBC search inputs from repeated or CSV query flags.
 * @returns Search inputs for the RBC finder.
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

/** Runs the RBC finder scraper and optionally writes mapped rows. */
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
      `[rbc] target: ${options.write ? (targetUrl() ?? describeTarget()) : "dry-run"}`
    );
  }
  const touchedCounts = await touchFirmSourceTables(
    TABLE_ORDER,
    rows,
    options,
    writeRows
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
): Promise<RbcRows> => {
  const nonce = await fetchNonce();
  const logAndFetch = (input: string): ReturnType<typeof fetchAdvisors> => {
    console.error(
      `[rbc] fetching input=${JSON.stringify(input)} max=${maxAdvisors}`
    );
    return fetchAdvisors(input, maxAdvisors, nonce);
  };
  return await inputs.reduce<Promise<RbcRows>>(async (previous, input) => {
    const advisors = await logAndFetch(input);
    return mergeRows(
      await previous,
      RBC_SOURCE_ADAPTER.mapRows(advisors, checkedAt)
    );
  }, Promise.resolve(emptyRbcRows()));
};

const fetchNonce = async (): Promise<string> => {
  const nonce = parseRbcNonce(await fetchHtml(RBC_FINDER_PAGE_URL));
  if (!nonce) throw new Error("RBC finder page did not include an AJAX nonce.");
  return nonce;
};

const fetchAdvisors = async (
  input: string,
  maxAdvisors: number,
  nonce: string
): Promise<ReadonlyArray<RbcAdvisorSource>> => {
  const branches = parseRbcBranches(
    await postAjax({
      action: "rbcwm_get_advisors_branches",
      nonce,
      location_string: input,
      data_source: "us",
    })
  );
  return collectBranchAdvisors(branches, maxAdvisors, nonce);
};

const collectBranchAdvisors = async (
  branches: ReadonlyArray<RbcBranchSource>,
  maxAdvisors: number,
  nonce: string,
  collected: ReadonlyArray<RbcAdvisorSource> = []
): Promise<ReadonlyArray<RbcAdvisorSource>> => {
  if (collected.length >= maxAdvisors || branches.length === 0) {
    return collected.slice(0, maxAdvisors);
  }
  const [branch, ...remaining] = branches;
  const advisors = await fetchBranchAdvisors(branch, nonce);
  return collectBranchAdvisors(remaining, maxAdvisors, nonce, [
    ...collected,
    ...advisors,
  ]);
};

const fetchBranchAdvisors = async (
  branch: RbcBranchSource,
  nonce: string
): Promise<ReadonlyArray<RbcAdvisorSource>> => {
  try {
    return parseRbcAdvisors(
      await postAjax({
        action: "rbcwm_get_advisors_by_branch",
        nonce,
        branch_id: branch.branchId,
        data_source: "us",
      }),
      branch
    );
  } catch (error) {
    console.error(`[rbc] skipped branch ${branch.branchId}: ${String(error)}`);
    return [];
  }
};

const fetchHtml = async (url: string): Promise<string> => {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`RBC returned HTTP ${response.status}`);
  return response.text();
};

const postAjax = async (data: Record<string, string>): Promise<string> => {
  const response = await fetch(RBC_AJAX_ENDPOINT_URL, {
    method: "POST",
    headers: {
      ...requestHeaders(),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams(data),
  });
  if (!response.ok) {
    throw new Error(
      `RBC AJAX returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
  const json = (await response.json()) as Readonly<Record<string, unknown>>;
  if (json.success !== true) {
    throw new Error(`RBC AJAX returned unsuccessful payload.`);
  }
  const payloadData =
    json.data && typeof json.data === "object"
      ? (json.data as Readonly<Record<string, unknown>>)
      : undefined;
  return typeof payloadData?.html === "string" ? payloadData.html : "";
};

const requestHeaders = (): Record<string, string> => ({
  accept: "text/html,application/xhtml+xml,application/json",
  referer: RBC_FINDER_PAGE_URL,
  "user-agent": "Mozilla/5.0 advisory-rankings RBC scraper",
});

const mergeRows = (left: RbcRows, right: RbcRows): RbcRows => ({
  Firm: mergeTableRows(left.Firm, right.Firm),
  FirmAlias: mergeTableRows(left.FirmAlias, right.FirmAlias),
  Branch: mergeTableRows(left.Branch, right.Branch),
  Advisor: mergeTableRows(left.Advisor, right.Advisor),
  EmploymentHistory: mergeTableRows(
    left.EmploymentHistory,
    right.EmploymentHistory
  ),
  Designation: mergeTableRows(left.Designation, right.Designation),
  Team: mergeTableRows(left.Team, right.Team),
  TeamMembership: mergeTableRows(left.TeamMembership, right.TeamMembership),
  AdvisorResearchCheck: mergeTableRows(
    left.AdvisorResearchCheck,
    right.AdvisorResearchCheck
  ),
});

const mergeTableRows = <T extends Record<string, unknown>>(
  left: ReadonlyArray<T>,
  right: ReadonlyArray<T>
): ReadonlyArray<T> => [
  ...new Map([...left, ...right].map(row => [String(row.id), row])).values(),
];

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
