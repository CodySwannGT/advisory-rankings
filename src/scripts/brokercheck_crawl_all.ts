#!/usr/bin/env node
import { appendFile, mkdir } from "node:fs/promises";
import { BrokerCheckClient } from "../lib/brokercheck.js";
import { HarperREST, Resolver } from "../lib/brokercheck-load.js";
import { loadState, saveState } from "./fetch_brokercheck.js";
import { runSelectedPhases } from "./brokercheck_crawl_all_helpers.js";

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
  const rest = new HarperREST({ verbose: false });
  const resolver = new Resolver(rest);
  const client = new BrokerCheckClient({ rateSeconds, verbose: false });
  const state = await loadState();

  await log(
    `==== brokercheck_crawl_all START max-per-firm=${maxPerFirm || "unlimited"} max-runtime=${maxRuntimeSeconds}s force=${force} ====`
  );
  const summaries = await runSelectedPhases(
    rest,
    client,
    resolver,
    state,
    {
      maxPerFirm,
      force,
      log,
      onlyFirmId: arg("--only-firm-id"),
      deadline: start + maxRuntimeSeconds * 1000,
    },
    {
      skipFirmLookup: has("--skip-firm-lookup"),
      skipFirmSnapshots: has("--skip-firm-snapshots"),
      skipRosters: has("--skip-rosters"),
    }
  );

  await saveState(state);
  const elapsed = Math.round((Date.now() - start) / 1000);
  await log(
    `==== DONE in ${elapsed}s (${client.requestCount} HTTP, ${rest.readCount} REST reads, ${rest.writeCount} REST writes) ====`
  );
  await log(`summaries: ${JSON.stringify(summaries)}`);
  await log(`resolver stats: ${JSON.stringify(resolver.stats)}`);
}

await main();
