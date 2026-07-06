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
 * - Fails loudly if the built web root is missing, rather than as an opaque
 *   per-test timeout.
 *
 * All steps are skipped when `VITEST_SKIP_GLOBAL_SETUP` is set, which keeps
 * fast unit-only runs (and environments that pre-build) cheap.
 *
 * @see https://vitest.dev/config/#globalsetup
 * @module tests/global-setup
 */
import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { chromium } from "playwright";

/**
 * Resolves the absolute path to the `bun` executable.
 *
 * The path is resolved up front (rather than letting the OS search `PATH` at
 * spawn time) so the child process is launched from a fixed, known binary
 * instead of whatever a mutable `PATH` happens to resolve to.
 * @returns Absolute path to the `bun` binary.
 */
function resolveBunPath(): string {
  const directories = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidate = directories
    .map(directory => join(directory, "bun"))
    .find(binary => {
      try {
        accessSync(binary, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  if (!candidate) {
    throw new Error(
      "global-setup: could not locate the `bun` executable on PATH."
    );
  }
  return candidate;
}

/**
 * Build Harper output and ensure Chromium is installed before the suite runs.
 * Honours `VITEST_SKIP_GLOBAL_SETUP` for fast unit-only runs.
 */
export default function setup(): void {
  if (process.env.VITEST_SKIP_GLOBAL_SETUP) {
    return;
  }
  const webRoot = resolve("harper-app/web");
  const bun = resolveBunPath();

  execFileSync(bun, ["run", "build"], { stdio: "inherit" });

  if (!existsSync(chromium.executablePath())) {
    execFileSync(bun, ["x", "playwright", "install", "chromium"], {
      stdio: "inherit",
    });
  }

  // Surface the built web root early so a misconfigured build fails loudly here
  // rather than as an opaque per-test timeout.
  if (!existsSync(webRoot)) {
    throw new Error(
      `Harper web output not found at ${webRoot} after build; the browser regression tests cannot run.`
    );
  }
}
