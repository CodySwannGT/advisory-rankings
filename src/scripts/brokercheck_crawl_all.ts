#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import { loadCreds } from "./_auth.js";
import { loadState, saveState } from "./fetch_brokercheck_core.js";
import {
  runSelectedPhases,
  type CrawlPhaseFlags,
  type WalkFirmRostersOptions,
} from "./brokercheck_crawl_all_helpers.js";

const LOG_FILE = "research/brokercheck-crawl.log";
const DEFAULT_MAX_RUNTIME_SECONDS = 4 * 3600;

/**
 * Reads a value that follows a command-line option.
 * @param name - Option name, such as `--max-per-firm`.
 * @returns The next argument when the option is present.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Checks whether a boolean command-line option is present.
 * @param name - Option name, such as `--force`.
 * @returns True when the flag appears in `process.argv`.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Writes crawl progress to stderr and the persistent research log.
 * @param parts - Values that should be joined into one log line.
 * @returns Resolves after the log file append completes.
 */
async function log(...parts: ReadonlyArray<unknown>): Promise<void> {
  const line = `[${new Date().toISOString()}] ${parts.map(String).join(" ")}\n`;
  process.stderr.write(line);
  await mkdir("research", { recursive: true });
  await appendFile(LOG_FILE, line);
}

/**
 * Logs the run banner, then executes the selected crawl phases. Bundling the
 * announce-and-run pair keeps the awaited phase summaries out of a scope where
 * the banner's logging side effect would precede a definition.
 * @param banner - Start banner describing the run's bounds.
 * @param phaseArgs - Arguments forwarded verbatim to {@link runSelectedPhases}.
 * @returns Per-phase summary payload.
 */
async function announceAndRunPhases(
  banner: string,
  ...phaseArgs: Parameters<typeof runSelectedPhases>
): Promise<Readonly<Record<string, unknown>>> {
  await log(banner);
  return runSelectedPhases(...phaseArgs);
}

/**
 * Runs the multi-phase BrokerCheck firm crawler from command-line flags.
 * @returns Resolves after selected phases finish and state is saved.
 */
async function main(): Promise<void> {
  const start = Date.now();
  const maxRuntimeSeconds = Number(
    arg("--max-runtime-seconds") ?? DEFAULT_MAX_RUNTIME_SECONDS
  );
  const maxPerFirm = Number(arg("--max-per-firm") ?? "0");
  const rateSeconds = arg("--rate-seconds")
    ? Number(arg("--rate-seconds"))
    : undefined;
  const force = has("--force");
  const rest = createHarperRest();
  const resolver = new Resolver(rest);
  const client = new BrokerCheckClient({ rateSeconds, verbose: false });
  const state = await loadState();
  const opts = crawlAllOptions(maxPerFirm, force, start, maxRuntimeSeconds);
  const summaries = await announceAndRunPhases(
    `==== brokercheck_crawl_all START max-per-firm=${maxPerFirm || "unlimited"} max-runtime=${maxRuntimeSeconds}s force=${force} ====`,
    rest,
    client,
    resolver,
    state,
    opts,
    selectedPhases()
  );

  await saveState(state);
  await log(
    `==== DONE in ${Math.round((Date.now() - start) / 1000)}s (${client.requestCount} HTTP, ${rest.readCount} REST reads, ${rest.writeCount} REST writes) ====`
  );
  await log(`summaries: ${JSON.stringify(summaries)}`);
  await log(`resolver stats: ${JSON.stringify(resolver.stats)}`);
}

/**
 * Builds bounded roster-crawl options from command-line flags.
 * @param maxPerFirm Maximum advisors to crawl per firm; zero means unlimited.
 * @param force Whether to refresh existing snapshots.
 * @param start Start timestamp used to derive the deadline.
 * @param maxRuntimeSeconds Runtime bound in seconds.
 * @returns Options for selected BrokerCheck crawl phases.
 */
function crawlAllOptions(
  maxPerFirm: number,
  force: boolean,
  start: number,
  maxRuntimeSeconds: number
): WalkFirmRostersOptions {
  return {
    maxPerFirm,
    force,
    log,
    onlyFirmId: arg("--only-firm-id"),
    deadline: start + maxRuntimeSeconds * 1000,
  };
}

/**
 * Reads phase-skip flags from command-line arguments.
 * @returns Selected BrokerCheck crawl phase flags.
 */
function selectedPhases(): CrawlPhaseFlags {
  return {
    skipFirmLookup: has("--skip-firm-lookup"),
    skipFirmSnapshots: has("--skip-firm-snapshots"),
    skipRosters: has("--skip-rosters"),
  };
}

const createHarperRest = (): HarperREST => {
  const creds = loadCreds();
  return new HarperREST({
    baseUrl: process.env.HDB_TARGET_URL ?? creds.clusterUrl,
    user:
      process.env.HDB_ADMIN_USERNAME ??
      process.env.HARPER_ADMIN_USERNAME ??
      creds.username,
    password:
      process.env.HDB_ADMIN_PASSWORD ??
      process.env.HARPER_ADMIN_PASSWORD ??
      creds.password,
    verbose: false,
  });
};

await main();
