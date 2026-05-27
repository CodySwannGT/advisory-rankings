#!/usr/bin/env node
import {
  type MediaMode,
  type MediaRow,
  discoverMedia,
  mediaField,
  nameFor,
} from "../lib/media-backfill.js";
import { restPut } from "../lib/rest.js";
import { createAuthTokens, loadCreds } from "./_auth.js";

/** CLI target values accepted by `--target`. */
type TargetKind = "advisors" | "firms" | "all";

/** Convenience alias matching the lib-side row contract. */
type Row = MediaRow;

/** Options shared by every row-processing pass. */
interface ProcessRowsInput {
  readonly rows: ReadonlyArray<Row>;
  readonly table: string;
  readonly mode: MediaMode;
  readonly baseUrl: string;
  readonly token: string;
  readonly max: number;
  readonly write: boolean;
  readonly delayMs: number;
}

/** Running tally of successful candidates produced by `processRow`. */
interface RowSummary {
  readonly found: number;
  readonly written: number;
}

/** Scanned-row totals returned by `processRows`. */
interface RowSummaryWithScanned extends RowSummary {
  readonly scanned: number;
}

/**
 * Reads one CLI option by name.
 * @param name - Flag name such as `--max`.
 * @returns Option value or undefined when absent.
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Checks whether a boolean CLI flag was supplied.
 * @param name - Flag name such as `--write`.
 * @returns True when present in argv.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Pauses between search and fetch requests.
 * @param ms - Delay in milliseconds.
 * @returns Promise that resolves after the delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses the target entity kind requested for the backfill.
 * @returns Advisor, firm, or all target selection.
 */
function targetKind(): TargetKind {
  const value = arg("--target") ?? "all";
  if (value === "advisors" || value === "firms" || value === "all")
    return value;
  throw new Error("--target must be advisors, firms, or all");
}

/**
 * Loads rows from one Harper table through the REST facade.
 * @param table - Harper table name.
 * @param token - Operation token for bearer auth.
 * @param baseUrl - Harper base URL.
 * @returns Table rows, or an empty array when the response shape is unexpected.
 */
async function getRows(
  table: "Advisor" | "Firm" | "EmploymentHistory",
  token: string,
  baseUrl: string
): Promise<ReadonlyArray<Row>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const res = await fetch(`${baseUrl}/${table}/`, { headers });
  if (!res.ok) throw new Error(`GET /${table}/ -> ${res.status}`);
  const rows: unknown = await res.json();
  return isRowArray(rows) ? rows : [];
}

/**
 * Type predicate that narrows an unknown REST payload to a Harper row list.
 * @param value - Raw JSON value returned by Harper.
 * @returns True when the payload is an array of row-shaped objects.
 */
function isRowArray(value: unknown): value is ReadonlyArray<Row> {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === "object" && item !== null)
  );
}

/**
 * Adds current firm names to advisors so headshot queries include firm context.
 * @param advisors - Advisor rows missing headshots.
 * @param firms - Firm rows keyed by id.
 * @param employments - Employment rows used to find current firm.
 * @returns Advisor rows with `_currentFirmName` hints.
 */
function attachCurrentFirmNames(
  advisors: ReadonlyArray<Row>,
  firms: ReadonlyArray<Row>,
  employments: ReadonlyArray<Row>
): ReadonlyArray<Row> {
  const byFirm = new Map<unknown, Row>(firms.map(firm => [firm.id, firm]));
  return advisors.map(advisor => ({
    ...advisor,
    _currentFirmName: byFirm.get(
      currentEmployment(employments, advisor.id)?.firmId
    )?.name,
  }));
}

/**
 * Finds the latest current employment for one advisor.
 * @param employments - Employment rows loaded from Harper.
 * @param advisorId - Advisor id whose current firm should be found.
 * @returns Current employment row or undefined.
 */
function currentEmployment(
  employments: ReadonlyArray<Row>,
  advisorId: unknown
): Row | undefined {
  return employments
    .filter(row => row.advisorId === advisorId && !row.endDate)
    .sort((left, right) =>
      String(right.startDate ?? "").localeCompare(String(left.startDate ?? ""))
    )[0];
}

/**
 * Writes a media URL back to Harper when `--write` is supplied.
 * @param baseUrl - Harper base URL.
 * @param token - Operation token for bearer auth.
 * @param table - Destination Harper table.
 * @param row - Updated row payload.
 * @returns True when the REST write succeeds.
 */
async function updateRow(
  baseUrl: string,
  token: string,
  table: string,
  row: Row
): Promise<boolean> {
  return await restPut(baseUrl, table, row, `Bearer ${token}`);
}

/**
 * Processes selected rows sequentially to keep search and source requests polite.
 * @param input - Row selection, auth, and write options.
 * @returns Summary counts for scanned, found, and written rows.
 */
async function processRows(
  input: ProcessRowsInput
): Promise<RowSummaryWithScanned> {
  const field = mediaField(input.mode);
  const missing = input.rows.filter(
    row => row.id && nameFor(row, input.mode) && !row[field]
  );
  const nameFilter = arg("--name")?.toLowerCase();
  const filtered = nameFilter
    ? missing.filter(row =>
        nameFor(row, input.mode).toLowerCase().includes(nameFilter)
      )
    : missing;
  const selected = input.max > 0 ? filtered.slice(0, input.max) : filtered;
  const summary = await selected.reduce<Promise<RowSummary>>(
    async (previous, row) => processRow(input, field, row, await previous),
    Promise.resolve({ found: 0, written: 0 })
  );

  console.log(
    `${input.table} summary: scanned=${selected.length} found=${summary.found} written=${summary.written}`
  );
  return { scanned: selected.length, ...summary };
}

/**
 * Processes one advisor or firm media candidate.
 * @param input - Row processing options.
 * @param field - Destination media field for the row.
 * @param row - Selected advisor or firm row.
 * @param summary - Running summary counts.
 * @returns Updated summary counts.
 */
async function processRow(
  input: ProcessRowsInput,
  field: string,
  row: Row,
  summary: RowSummary
): Promise<RowSummary> {
  const name = nameFor(row, input.mode);
  const candidate = await discoverMedia(row, input.mode, arg("--source-url"));
  if (!candidate) {
    console.log(`${input.table}\tMISS\t${name}`);
    await sleep(input.delayMs);
    return summary;
  }
  const written = input.write
    ? await updateMediaRow(input, field, row, candidate.url)
    : false;
  console.log(
    `${input.table}\tFOUND\t${name}\t${candidate.url}\t${candidate.sourceUrl}\tscore=${candidate.score}`
  );
  await sleep(input.delayMs);
  return {
    found: summary.found + 1,
    written: summary.written + (written ? 1 : 0),
  };
}

/**
 * Writes the discovered media URL to the selected row.
 * @param input - Row processing options.
 * @param field - Destination media field.
 * @param row - Selected advisor or firm row.
 * @param url - Discovered media URL.
 * @returns True when a write occurred and succeeded.
 */
function updateMediaRow(
  input: ProcessRowsInput,
  field: string,
  row: Row,
  url: string
): Promise<boolean> {
  return updateRow(input.baseUrl, input.token, input.table, {
    ...row,
    [field]: url,
  });
}

/**
 * Removes trailing slashes without using backtracking-prone regexes.
 * @param value - URL string that may include trailing slash characters.
 * @returns URL without trailing slashes.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

/**
 * Runs the media backfill CLI.
 * @returns Promise that resolves when selected targets complete.
 */
async function main(): Promise<void> {
  const creds = loadCreds();
  const tokens = await createAuthTokens(creds);
  const baseUrl = stripTrailingSlashes(creds.clusterUrl);
  const token = tokens.operation_token;
  const max = Number(arg("--max") ?? "10");
  const delayMs = Number(arg("--delay-ms") ?? "1500");
  const write = has("--write");
  const target = targetKind();

  const [advisors, firms, employments] = await Promise.all([
    getRows("Advisor", token, baseUrl),
    getRows("Firm", token, baseUrl),
    getRows("EmploymentHistory", token, baseUrl).catch(
      (): ReadonlyArray<Row> => []
    ),
  ]);

  if (target === "advisors" || target === "all") {
    await processRows({
      rows: attachCurrentFirmNames(advisors, firms, employments),
      table: "Advisor",
      mode: "advisor",
      baseUrl,
      token,
      max,
      write,
      delayMs,
    });
  }
  if (target === "firms" || target === "all") {
    await processRows({
      rows: firms,
      table: "Firm",
      mode: "firm",
      baseUrl,
      token,
      max,
      write,
      delayMs,
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
