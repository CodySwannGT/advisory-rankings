/**
 * Vitest global setup for the Harper/Fabric stack.
 *
 * Lisa governance forces the `test` / `test:cov` scripts to a bare
 * `vitest run`, dropping the `bun run build && bun run test:setup:playwright`
 * preamble this project's web tests depend on. Those preconditions are
 * reinstated here so the forced scripts remain self-sufficient and survive
 * future Lisa updates (this setup is wired via the create-only
 * `vitest.config.local.ts`).
 *
 * - Builds the Harper deploy + web output (`harper-app/web`, `harper-app/*.js`)
 *   that the browser regression tests read from disk.
 * - Ensures the Playwright Chromium browser is installed for the tests that
 *   launch a real browser.
 *
 * @module tests/global-setup
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

/**
 * Run a command, streaming its output, and throw on a non-zero exit.
 * @param command - Executable to run
 * @param args - Arguments for the command
 */
function run(command: string, args: readonly string[]): void {
  execFileSync(command, args as string[], { stdio: "inherit" });
}

/**
 * Build Harper output and ensure Chromium is installed before the suite runs.
 */
export default function setup(): void {
  const webRoot = resolve("harper-app/web");

  run("bun", ["run", "build"]);

  if (!existsSync(chromium.executablePath())) {
    run("bunx", ["playwright", "install", "chromium"]);
  }

  // Surface the built web root early so a misconfigured build fails loudly here
  // rather than as an opaque per-test timeout.
  if (!existsSync(webRoot)) {
    throw new Error(
      `Harper web output not found at ${webRoot} after build; the browser regression tests cannot run.`
    );
  }
}
