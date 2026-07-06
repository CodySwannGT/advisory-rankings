import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  FIRM_SOURCE_TABLES,
  type AdapterArtifact,
  type AdapterArtifactPath,
  type AdapterModeArtifact,
  type AdapterStatus,
  type CommandFailure,
  type CommandRunner,
  type FirmSourceTable,
  type MajorFirmAdapter,
  type MajorFirmImportOptions,
  type MajorFirmImportSummary,
} from "./major-firm-imports-types.js";

const execFileAsync = promisify(execFile);

/** Production-ready major firm adapters covered by PRD #234 DATA-2. */
const MAJOR_FIRM_ADAPTERS: ReadonlyArray<MajorFirmAdapter> = [
  adapter("morgan-stanley", "Morgan Stanley", "scrape_morgan_stanley.js", ""),
  adapter("wells-fargo", "Wells Fargo Advisors", "scrape_wells_fargo.js"),
  adapter("merrill", "Merrill / Bank of America", "scrape_merrill.js"),
  adapter("rbc", "RBC Wealth Management", "scrape_rbc.js"),
  adapter("raymond-james", "Raymond James", "scrape_raymond_james.js"),
  adapter("edward-jones", "Edward Jones", "scrape_edward_jones.js"),
  adapter("stifel", "Stifel", "scrape_stifel.js", "ny"),
  adapter("ubs", "UBS Wealth Management USA", "scrape_ubs.js", "smith"),
];

/**
 * Runs dry-run and optional write passes for every major firm adapter.
 * @param options - Bounded import options and artifact destination.
 * @param runner - Command executor, injectable for tests.
 * @returns Summary of every adapter attempt and artifact path.
 */
export async function runMajorFirmImports(
  options: MajorFirmImportOptions,
  runner: CommandRunner = runCommand
): Promise<MajorFirmImportSummary> {
  await mkdir(options.outputDir, { recursive: true });
  const artifacts = await Promise.all(
    MAJOR_FIRM_ADAPTERS.map(firm =>
      runAdapter(firm, options, runner).then(async artifact => {
        const artifactPath = path.join(options.outputDir, `${firm.slug}.json`);
        await writeJson(artifactPath, artifact);
        return { artifact, artifactPath };
      })
    )
  );
  const summary = buildSummary(options, artifacts);
  await writeJson(path.join(options.outputDir, "summary.json"), summary);
  return summary;
}

/**
 * Classifies a dry-run/write pair into the review-facing adapter outcome.
 * @param dryRun - Dry-run command artifact.
 * @param writeRun - Optional write command artifact.
 * @returns Adapter status for summary reporting.
 */
export function summarizeAdapterStatus(
  dryRun: AdapterModeArtifact,
  writeRun: AdapterModeArtifact | undefined
): AdapterStatus {
  if (!dryRun.ok) return "blocked";
  if (!writeRun) return dryRun.totalRows > 0 ? "mapped" : "source-limited";
  if (!writeRun.ok) return "write-blocked";
  if (writeRun.totalTouched > 0) return "written";
  return dryRun.totalRows > 0 ? "write-blocked" : "source-limited";
}

/**
 * Converts adapter JSON stdout into a compact, auditable mode artifact.
 * @param mode - Adapter mode that produced stdout.
 * @param command - Full command used for the adapter attempt.
 * @param stdout - Captured adapter stdout.
 * @param stderr - Captured adapter stderr.
 * @param sampleLimit - Maximum sampled rows per table.
 * @returns Parsed adapter mode artifact.
 */
export function extractModeArtifact(
  mode: AdapterModeArtifact["mode"],
  command: ReadonlyArray<string>,
  stdout: string,
  stderr: string,
  sampleLimit: number
): AdapterModeArtifact {
  const payload = parseJsonPayload(stdout);
  const counts = readCounts(payload["counts"]);
  const touchedCounts = readCounts(payload["touchedCounts"]);
  const rows = readRows(payload["rows"]);
  return {
    mode,
    command,
    ok: true,
    stdout,
    stderr,
    counts,
    touchedCounts,
    totalRows: sumCounts(counts),
    totalTouched: sumCounts(touchedCounts),
    sampleRows: sampleRows(rows, sampleLimit),
  };
}

/**
 * Builds adapter metadata with the shared default ZIP query.
 * @param slug - Stable adapter slug.
 * @param displayName - Human-facing firm name.
 * @param script - Compiled adapter script filename.
 * @param query - Default bounded search query.
 * @returns Major firm adapter metadata.
 */
function adapter(
  slug: string,
  displayName: string,
  script: string,
  query = "10022"
): MajorFirmAdapter {
  return { slug, displayName, script, queries: [query] };
}

const runAdapter = async (
  firm: MajorFirmAdapter,
  options: MajorFirmImportOptions,
  runner: CommandRunner
): Promise<AdapterArtifact> => {
  const dryRun = await runAdapterMode(firm, options, "dry-run", runner);
  const writeRun = options.write
    ? await runAdapterMode(firm, options, "write", runner)
    : undefined;
  return {
    slug: firm.slug,
    displayName: firm.displayName,
    queries: firm.queries,
    status: summarizeAdapterStatus(dryRun, writeRun),
    dryRun,
    writeRun,
  };
};

const runAdapterMode = async (
  firm: MajorFirmAdapter,
  options: MajorFirmImportOptions,
  mode: AdapterModeArtifact["mode"],
  runner: CommandRunner
): Promise<AdapterModeArtifact> => {
  const command = adapterCommand(firm, options, mode);
  try {
    const result = await runner(command[0], command.slice(1));
    return extractModeArtifact(
      mode,
      command,
      result.stdout,
      result.stderr,
      options.sampleLimit
    );
  } catch (error) {
    return failedModeArtifact(mode, command, error);
  }
};

const adapterCommand = (
  firm: MajorFirmAdapter,
  options: MajorFirmImportOptions,
  mode: AdapterModeArtifact["mode"]
): ReadonlyArray<string> => [
  process.execPath,
  path.join("dist", "scripts", firm.script),
  ...firm.queries.flatMap(query => ["--query", query]),
  "--max-advisors",
  String(options.maxAdvisors),
  "--checked-at",
  options.checkedAt,
  "--json",
  ...(mode === "write" ? ["--write"] : []),
];

const failedModeArtifact = (
  mode: AdapterModeArtifact["mode"],
  command: ReadonlyArray<string>,
  error: unknown
): AdapterModeArtifact => {
  const failure = error as CommandFailure;
  return {
    mode,
    command,
    ok: false,
    stdout: failure.stdout ?? "",
    stderr: failure.stderr ?? "",
    counts: {},
    touchedCounts: {},
    totalRows: 0,
    totalTouched: 0,
    sampleRows: {},
    error: failure.message ?? String(error),
  };
};

const buildSummary = (
  options: MajorFirmImportOptions,
  artifacts: ReadonlyArray<AdapterArtifactPath>
): MajorFirmImportSummary => ({
  generatedAt: new Date().toISOString(),
  checkedAt: options.checkedAt,
  maxAdvisors: options.maxAdvisors,
  write: options.write,
  outputDir: options.outputDir,
  adapters: artifacts.map(({ artifact, artifactPath }) => ({
    slug: artifact.slug,
    displayName: artifact.displayName,
    status: artifact.status,
    dryRunRows: artifact.dryRun.totalRows,
    writeTouched: artifact.writeRun?.totalTouched,
    artifactPath,
  })),
});

const runCommand: CommandRunner = async (command, args) =>
  execFileAsync(command, [...args], {
    maxBuffer: 20 * 1024 * 1024,
    env: Reflect.get(process, "env") as NodeJS.ProcessEnv,
  });

const parseJsonPayload = (stdout: string): Record<string, unknown> => {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Adapter returned no JSON.");
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
};

const readCounts = (value: unknown): Record<string, number> =>
  value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, count]) => [
          key,
          typeof count === "number" ? count : 0,
        ])
      )
    : {};

const readRows = (
  value: unknown
): Partial<Record<FirmSourceTable, ReadonlyArray<Record<string, unknown>>>> =>
  value && typeof value === "object"
    ? Object.fromEntries(
        FIRM_SOURCE_TABLES.map(table => {
          const rows = (value as Record<string, unknown>)[table];
          return [table, Array.isArray(rows) ? rows : []];
        })
      )
    : {};

const sampleRows = (
  rows: Partial<
    Record<FirmSourceTable, ReadonlyArray<Record<string, unknown>>>
  >,
  limit: number
): Partial<Record<FirmSourceTable, ReadonlyArray<Record<string, unknown>>>> =>
  Object.fromEntries(
    FIRM_SOURCE_TABLES.map(table => [
      table,
      (rows[table] ?? []).slice(0, limit),
    ]).filter(([, value]) => (value as ReadonlyArray<unknown>).length > 0)
  );

const sumCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
