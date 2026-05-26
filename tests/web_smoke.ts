#!/usr/bin/env node
/**
 * Playwright smoke test for the public web UI.
 *
 * The test walks the feed, profile pages, article provenance, directory
 * pages, auth affordance, and mobile drawer. Screenshots are written to
 * tests/screenshots for quick visual inspection when a check fails.
 */

import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import {
  BASE,
  SHOTS,
  authHeaders,
  newContext,
  type Check,
} from "./web_smoke_support.js";
import {
  smokeArticle,
  smokeAuth,
  smokeCompliance,
  smokeDirectories,
  smokeFeed,
  smokeFirm,
  smokeNotFoundRecovery,
  smokeTeam,
  smokeAdvisor,
} from "./web_smoke_scenarios.js";
import { smokeGlobalSearch } from "./web_smoke_search.js";
import { smokeBreakpoints } from "./web_smoke_breakpoints.js";
import { smokeMobile } from "./web_smoke_mobile.js";
import { smokeRecruiting } from "./web_smoke_recruiting.js";
import { smokeRankings } from "./web_smoke_rankings.js";

/**
 * Runs the firm profile scenario and continues into the advisor profile.
 * @param page - Browser page shared by the desktop scenarios.
 * @returns Combined firm and advisor assertions.
 */
async function smokeFirmAndAdvisor(
  page: Parameters<typeof smokeFirm>[0]
): Promise<readonly Check[]> {
  const [firmChecks, pastBlock] = await smokeFirm(page);
  return [...firmChecks, ...(await smokeAdvisor(page, pastBlock))];
}

/**
 * Prints the aggregate smoke result and sets the process exit code on failure.
 * @param checks - All checks collected during the smoke journey.
 */
function printResults(checks: readonly Check[]): void {
  const failures = checks.filter(result => !result.passed);

  console.log("\n──────── SMOKE TEST RESULTS ────────");
  for (const result of checks)
    console.log(`  ${result.passed ? "✓" : "✗"} ${result.label}`);
  console.log(
    `──────── ${failures.length === 0 ? "PASS" : "FAIL"} (${checks.length - failures.length}/${checks.length}) ────────\n`
  );
  console.log("Screenshots written to", SHOTS);
  process.exitCode = failures.length ? 1 : 0;
}

/**
 * Runs the ordered desktop and mobile smoke scenarios.
 * @param browser - Browser used for the mobile scenario.
 * @param page - Browser page shared by desktop scenarios.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns All smoke assertions.
 */
async function runScenarios(
  browser: Browser,
  page: Parameters<typeof smokeFeed>[0],
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  return [
    ...(await smokeFeed(page)),
    ...(await smokeRecruiting(page)),
    ...(await smokeRankings(page)),
    ...(await smokeGlobalSearch(page)),
    ...(await smokeFirmAndAdvisor(page)),
    ...(await smokeTeam(page)),
    ...(await smokeArticle(page)),
    ...(await smokeCompliance(page)),
    ...(await smokeDirectories(page)),
    ...(await smokeNotFoundRecovery(page)),
    ...(await smokeAuth(page)),
    ...(await smokeBreakpoints(browser, extraHTTPHeaders)),
    ...(await smokeMobile(browser, extraHTTPHeaders)),
  ];
}

/**
 * Runs all smoke scenarios in a single browser session.
 */
async function main(): Promise<void> {
  const extraHTTPHeaders = await authHeaders();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(
      browser,
      { width: 1280, height: 900 },
      extraHTTPHeaders
    );
    const page = await context.newPage();

    await mkdir(SHOTS, { recursive: true });
    console.log(
      "▶ smoke against",
      BASE,
      extraHTTPHeaders ? "(JWT bearer)" : "(anonymous, as a real visitor)"
    );
    printResults(await runScenarios(browser, page, extraHTTPHeaders));
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(
    "test runner crashed:",
    err instanceof Error ? err.stack || err.message : err
  );
  process.exitCode = 2;
});
