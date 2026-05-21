#!/usr/bin/env node
import {
  buildResearchCheck,
  selectDueAdvisors,
  type AdvisorResearchAdvisor,
  type AdvisorResearchCheck,
} from "../lib/advisor-research.js";
import { sql, upsert } from "../lib/harper.js";
import { loadCreds, StudioSession } from "./_auth.js";

const DEFAULT_SOURCE_TYPE = "web_research";

/**
 * Read a positional option from process argv.
 * @param name Option name to read.
 * @returns The following argv value, when present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Check whether a flag is present.
 * @param name Flag name.
 * @returns True when argv includes the flag.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Read a required option from argv.
 * @param name Option name to read.
 * @returns The following argv value.
 */
function requiredArg(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Determine the research source lane.
 * @returns Source type option or the default public-web lane.
 */
function sourceType(): string {
  return arg("--source-type") ?? DEFAULT_SOURCE_TYPE;
}

/**
 * Read the target URL marker that switches the script into Fabric mode.
 * @returns Deployed cluster URL when set.
 */
function targetUrl(): string | undefined {
  const value = process.env.HDB_TARGET_URL;
  if (!value) return undefined;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const studioPromise = {
  current: undefined as Promise<StudioSession> | undefined,
};

/**
 * Create or reuse a Studio session for Fabric operations.
 * @returns Authenticated Studio session.
 */
async function studio(): Promise<StudioSession> {
  studioPromise.current ??= new StudioSession(loadCreds()).login();
  return studioPromise.current;
}

/**
 * Run one Fabric cluster operation.
 * @param operation Operation name.
 * @param payload Operation payload.
 * @returns Operation response body.
 */
async function clusterOp<T>(
  operation: string,
  payload: Readonly<Record<string, unknown>>
): Promise<T> {
  const creds = loadCreds();
  const session = await studio();
  const response = await session.clusterOp(creds.clusterId, operation, payload);
  if (response.status !== 200) {
    throw new Error(
      `${operation} failed: ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`
    );
  }
  return response.body as T;
}

/**
 * Read a table through Fabric's operations proxy.
 * @param table Table name.
 * @returns Table rows.
 */
async function readViaOps<T>(table: string): Promise<ReadonlyArray<T>> {
  const response = await clusterOp<
    ReadonlyArray<T> | Partial<Record<"data", ReadonlyArray<T>>>
  >("sql", { sql: `SELECT * FROM data.${table}` });
  if (Array.isArray(response)) return response;
  const wrapped = response as Partial<Record<"data", ReadonlyArray<T>>>;
  return wrapped.data ?? [];
}

/**
 * Upsert an AdvisorResearchCheck through Fabric's operations proxy.
 * @param row Check row to write.
 * @returns True when Harper accepted the upsert.
 */
async function writeResearchCheckViaOps(
  row: Readonly<Record<string, unknown>>
): Promise<boolean> {
  const response = await clusterOp<
    Partial<Record<"upserted_hashes", ReadonlyArray<unknown>>>
  >("upsert", {
    database: "data",
    table: "AdvisorResearchCheck",
    records: [row] as const,
  });
  return Array.isArray(response.upserted_hashes)
    ? response.upserted_hashes.length === 1
    : true;
}

/**
 * Read a table from either local Harper or deployed Fabric.
 * @param table Table name.
 * @returns Table rows.
 */
async function readTable<T>(table: string): Promise<ReadonlyArray<T>> {
  const target = targetUrl();
  if (target) return readViaOps<T>(table);
  try {
    return (await sql<Readonly<Record<string, unknown>>>(
      `SELECT * FROM data.${table}`
    )) as ReadonlyArray<T>;
  } catch (error) {
    if (table === "AdvisorResearchCheck") return [];
    throw error;
  }
}

/**
 * Write an AdvisorResearchCheck in the current runtime mode.
 * @param row Check row to write.
 * @returns True when the row was written.
 */
async function writeCheck(
  row: Readonly<Record<string, unknown>>
): Promise<boolean> {
  const target = targetUrl();
  if (target) return writeResearchCheckViaOps(row);
  return (await upsert("AdvisorResearchCheck", [row])) === 1;
}

/**
 * Print advisors due for public-web research.
 */
async function due(): Promise<void> {
  const max = Number(arg("--max") ?? "5");
  const staleDays = Number(arg("--stale-days") ?? "30");
  const advisors = await readTable<AdvisorResearchAdvisor>("Advisor");
  const checks = await readTable<AdvisorResearchCheck>("AdvisorResearchCheck");
  const rows = selectDueAdvisors(advisors, checks, {
    max,
    staleDays,
    sourceType: sourceType(),
  });

  if (has("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`due advisors: ${rows.length}/${advisors.length}`);
  for (const row of rows) {
    const last = row.lastCheck?.checkedAt ?? "never";
    const crd = row.advisor.finraCrd ? ` crd=${row.advisor.finraCrd}` : "";
    const missing = row.missingFields.length
      ? ` missing=${row.missingFields.join(",")}`
      : "";
    console.log(
      `${row.advisor.id}\t${row.advisor.legalName ?? ""}\tlast=${last}${crd}${missing}`
    );
  }
}

/**
 * Record the outcome of one advisor public-web research check.
 */
async function record(): Promise<void> {
  const sources = (arg("--sources") ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const row = buildResearchCheck({
    advisorId: requiredArg("--advisor-id"),
    sourceType: sourceType(),
    status: requiredArg("--status"),
    notes: arg("--notes"),
    sourcesChecked: sources,
    nextCheckAfter: arg("--next-check-after"),
  });
  const ok = await writeCheck(row as unknown as Record<string, unknown>);
  if (!ok) throw new Error(`failed to write AdvisorResearchCheck ${row.id}`);
  console.log(JSON.stringify(row, null, 2));
}

const command = process.argv[2] ?? "due";
if (command === "due") await due();
else if (command === "record") await record();
else throw new Error("usage: research_advisors due|record [options]");
