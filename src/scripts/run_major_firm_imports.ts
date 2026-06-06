#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runMajorFirmImports } from "../lib/major-firm-imports.js";

const DEFAULT_MAX_ADVISORS = 5;
const DEFAULT_SAMPLE_LIMIT = 2;

/** CLI options accepted by the major firm-source import runner. */
interface CliOptions {
  readonly checkedAt: string;
  readonly maxAdvisors: number;
  readonly outputDir: string;
  readonly sampleLimit: number;
  readonly write: boolean;
}

/**
 * Parses a string-valued CLI flag from process arguments.
 * @param name - Flag name to read.
 * @returns Flag value when present.
 */
const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

/**
 * Checks whether a boolean CLI flag is present.
 * @param name - Flag name to test.
 * @returns True when the flag is present.
 */
const hasArg = (name: string): boolean => process.argv.includes(name);

/**
 * Resolves CLI options with bounded defaults.
 * @returns Import options for the library runner.
 */
const cliOptions = (): CliOptions => ({
  checkedAt: argValue("--checked-at") ?? new Date().toISOString().slice(0, 10),
  maxAdvisors: Number(argValue("--max-advisors") ?? DEFAULT_MAX_ADVISORS),
  outputDir:
    argValue("--output-dir") ??
    path.join(
      "artifacts",
      "firm-source-imports",
      new Date().toISOString().replace(/[:.]/gu, "-")
    ),
  sampleLimit: Number(argValue("--sample-limit") ?? DEFAULT_SAMPLE_LIMIT),
  write: hasArg("--write"),
});

/**
 * Prints the run summary as JSON for shell evidence capture.
 * @returns Resolves when all adapters have been attempted.
 */
const main = async (): Promise<void> => {
  console.log(JSON.stringify(await runMajorFirmImports(cliOptions()), null, 2));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
