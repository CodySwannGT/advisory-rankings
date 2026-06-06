#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE_URL =
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const DEFAULT_OUT = "evidence/data-depth-baseline.json";

const RESOURCE_PROBES = [
  { name: "recruiting", path: "/RecruitingMarket?limit=3" },
  { name: "firms", path: "/PublicFirms?limit=5" },
  { name: "advisors", path: "/PublicAdvisors?limit=5" },
  { name: "feed", path: "/Feed?limit=5" },
  { name: "coverage", path: "/RankingsExplorer?limit=10" },
] as const;

/** Logical name for one public-resource baseline probe. */
type ResourceName = (typeof RESOURCE_PROBES)[number]["name"];

/** Normalized command-line options for the baseline capture CLI. */
interface CliOptions {
  readonly baseUrl: string;
  readonly out: string;
  readonly stdout: boolean;
}

/** Durable baseline evidence report written to disk. */
interface BaselineReport {
  readonly capturedAt: string;
  readonly baseUrl: string;
  readonly endpoints: readonly EndpointEvidence[];
}

/** Captured status and summary for one public-resource endpoint. */
interface EndpointEvidence {
  readonly name: ResourceName;
  readonly path: string;
  readonly status: number;
  readonly ok: boolean;
  readonly elapsedMs: number;
  readonly summary: JsonRecord;
}

/** Loose JSON object used for compact evidence summaries. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Captures the public data-depth baseline resources from the deployed app.
 * @param options - Probe target and output options.
 * @returns Baseline report written by the CLI.
 */
export async function captureDataDepthBaseline(
  options: CliOptions
): Promise<BaselineReport> {
  const baseUrl = stripTrailingSlashes(options.baseUrl);
  const endpoints = await Promise.all(
    RESOURCE_PROBES.map(probe => captureEndpoint(baseUrl, probe))
  );
  return {
    capturedAt: new Date().toISOString(),
    baseUrl,
    endpoints,
  };
}

/**
 * Summarizes one resource payload into compact durable evidence.
 * @param name - Logical resource probe name.
 * @param payload - Decoded JSON response.
 * @returns Stable summary suited for checked-in baseline evidence.
 */
export function summarizeResourcePayload(
  name: ResourceName,
  payload: unknown
): JsonRecord {
  const body = recordValue(payload);
  if (name === "recruiting") return recruitingSummary(body);
  if (name === "firms") return directorySummary(body, ["name", "slug"]);
  if (name === "advisors")
    return directorySummary(body, ["displayName", "legalName", "slug"]);
  if (name === "feed") return feedSummary(body);
  return coverageSummary(body);
}

/**
 * Fetches and summarizes one public-resource probe.
 * @param baseUrl - Deployed app origin without a trailing slash.
 * @param probe - Resource probe metadata.
 * @returns Captured endpoint evidence for the report.
 */
async function captureEndpoint(
  baseUrl: string,
  probe: (typeof RESOURCE_PROBES)[number]
): Promise<EndpointEvidence> {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${probe.path}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  return {
    name: probe.name,
    path: probe.path,
    status: response.status,
    ok: response.ok,
    elapsedMs: Date.now() - started,
    summary: summarizeResourcePayload(probe.name, payload),
  };
}

/**
 * Builds the recruiting-resource baseline summary.
 * @param body - Decoded `/RecruitingMarket` JSON object.
 * @returns Compact recruiting depth evidence.
 */
function recruitingSummary(body: JsonRecord): JsonRecord {
  const summary = recordValue(body.summary);
  const recentMoves = arrayValue(body.recentMoves);
  const marketActivity = arrayValue(body.marketActivity);
  const firmMomentum = arrayValue(body.firmMomentum);
  return {
    summary,
    recentMoveCount: recentMoves.length,
    marketActivityCount: marketActivity.length,
    firmMomentumCount: firmMomentum.length,
    sampleRecentMoves: sampleRecords(recentMoves, [
      "id",
      "subject",
      "fromFirm",
      "toFirm",
      "sourceStatus",
      "provenance",
    ]),
  };
}

/**
 * Builds a public-directory baseline summary.
 * @param body - Decoded directory JSON object.
 * @param sampleKeys - Keys to retain from sampled rows.
 * @returns Compact directory depth evidence.
 */
function directorySummary(
  body: JsonRecord,
  sampleKeys: readonly string[]
): JsonRecord {
  const items = arrayValue(body.items);
  return {
    total: body.total ?? null,
    count: body.count ?? null,
    itemCount: items.length,
    nextCursorPresent: typeof body.nextCursor === "string",
    sampleItems: sampleRecords(items, sampleKeys),
  };
}

/**
 * Builds the home-feed baseline summary.
 * @param body - Decoded `/Feed` JSON object.
 * @returns Compact feed depth evidence.
 */
function feedSummary(body: JsonRecord): JsonRecord {
  const items = arrayValue(body.items);
  return {
    total: body.total ?? null,
    count: body.count ?? null,
    itemCount: items.length,
    nextCursorPresent: typeof body.nextCursor === "string",
    sampleItems: sampleRecords(
      items.map(item => recordValue(recordValue(item).article)),
      ["id", "headline", "category", "publishedDate"]
    ),
  };
}

/**
 * Builds the rankings coverage baseline summary.
 * @param body - Decoded `/RankingsExplorer` JSON object.
 * @returns Compact rankings coverage evidence.
 */
function coverageSummary(body: JsonRecord): JsonRecord {
  const items = arrayValue(body.items);
  const coverage = recordValue(body.coverage);
  return {
    total: body.total ?? null,
    count: body.count ?? null,
    itemCount: items.length,
    coverage,
    sampleItems: sampleRecords(items, [
      "id",
      "firmText",
      "sourceStatus",
      "resolutionStatus",
    ]),
  };
}

/**
 * Samples up to three objects and keeps only selected fields.
 * @param values - Candidate response rows.
 * @param keys - Keys to keep in each sampled row.
 * @returns Sample records suitable for durable evidence.
 */
function sampleRecords(
  values: readonly unknown[],
  keys: readonly string[]
): readonly JsonRecord[] {
  return values
    .map(recordValue)
    .filter(record => Object.keys(record).length > 0)
    .slice(0, 3)
    .map(record => pickJson(record, keys));
}

/**
 * Picks known JSON fields from one record.
 * @param record - Source record.
 * @param keys - Field names to retain.
 * @returns A compact record containing only requested keys.
 */
function pickJson(record: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(
    keys
      .filter(key => key in record)
      .map(key => [key, record[key] ?? null] as const)
  );
}

/**
 * Narrows an unknown value to an object record.
 * @param value - Candidate JSON value.
 * @returns Object record or an empty object for non-record values.
 */
function recordValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

/**
 * Narrows an unknown value to an array.
 * @param value - Candidate JSON value.
 * @returns Array value or an empty array for non-arrays.
 */
function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Removes trailing slashes from a URL string.
 * @param value - URL-like value.
 * @returns The same value without trailing slash characters.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

/**
 * Parses supported CLI flags.
 * @param argv - Command-line arguments after the script name.
 * @returns Normalized CLI options.
 */
function parseArgs(argv: readonly string[]): CliOptions {
  const baseUrl = valueAfter(argv, "--base-url") ?? DEFAULT_BASE_URL;
  const out = valueAfter(argv, "--out") ?? DEFAULT_OUT;
  return {
    baseUrl,
    out,
    stdout: argv.includes("--stdout"),
  };
}

/**
 * Reads the argument immediately following a flag.
 * @param argv - Command-line arguments.
 * @param flag - Flag to locate.
 * @returns The following argument, or undefined when absent.
 */
function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * Writes the baseline report to disk.
 * @param report - Baseline evidence report.
 * @param out - Output path.
 */
async function writeReport(report: BaselineReport, out: string): Promise<void> {
  const target = resolve(out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`data-depth baseline written: ${target}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const report = await captureDataDepthBaseline(options);
  if (options.stdout) console.log(JSON.stringify(report, null, 2));
  await writeReport(report, options.out);
}
