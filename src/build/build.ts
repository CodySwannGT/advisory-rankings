import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const HARPER_WEB_DIR = "harper-app/web";
const HARPER_APP_DIR = "harper-app";
const PACKAGE_JSON = "package.json";
const execFileAsync = promisify(execFile);

const WEB_ENTRYPOINTS = [
  "advisor.js",
  "app.js",
  "article.js",
  "branches.js",
  "compare.js",
  "compare-selection.js",
  "correction-inbox.js",
  "coverage.js",
  "design-system/index.js",
  "detail-state.js",
  "discrepancy-queue.js",
  "firm.js",
  "index.js",
  "login.js",
  "not-found.js",
  "rankings.js",
  "recruiting.js",
  "regulatory.js",
  "report-packet.js",
  "research-freshness.js",
  "route-loading.js",
  "team.js",
  "watchlists.js",
];

/** Minimal package fields needed for generated browser metadata. */
interface PackageManifest {
  readonly version?: string;
}

/**
 * Bundles generated browser modules into Harper's static web root.
 * @returns Promise that resolves after generated web files are deploy-ready.
 */
async function copyGeneratedWeb(): Promise<void> {
  await mkdir(HARPER_WEB_DIR, { recursive: true });
  await removeGeneratedWebJavaScript(HARPER_WEB_DIR);
  await bundleWebEntrypoints();
  await writeGeneratedVersionModule();
}

/**
 * Removes previously generated browser JavaScript so deploys cannot retain
 * stale helper modules after the page entries are bundled.
 * @param dir Static web directory to clean recursively.
 */
async function removeGeneratedWebJavaScript(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeGeneratedWebJavaScript(path);
      continue;
    }
    if (entry.name.endsWith(".js")) await rm(path, { force: true });
  }
}

/**
 * Uses Bun's browser bundler to collapse each HTML shell entrypoint into one
 * deployable module. This avoids the Fabric serving node's reset-prone burst
 * of dozens of concurrent transitive ES-module requests on a cold page boot.
 */
async function bundleWebEntrypoints(): Promise<void> {
  const entrypoints = WEB_ENTRYPOINTS.map(entry => join("dist/web", entry));
  await execFileAsync(
    "bun",
    [
      "build",
      ...entrypoints,
      "--target=browser",
      "--format=esm",
      "--root",
      "dist/web",
      "--entry-naming",
      "[dir]/[name].[ext]",
      "--outdir",
      HARPER_WEB_DIR,
    ],
    { maxBuffer: 1024 * 1024 * 10 }
  );
}

/**
 * Writes the package version into the browser bundle at build time.
 * @returns Promise that resolves once the version module is refreshed.
 */
async function writeGeneratedVersionModule(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(PACKAGE_JSON, "utf8")
  ) as PackageManifest;
  const version = manifest.version || "0.0.0";

  await writeFile(
    join(HARPER_WEB_DIR, "version.js"),
    `export const APP_VERSION = ${JSON.stringify(version)};\n`
  );
}

/**
 * Copies all compiled Harper resource modules into the Fabric component root.
 *
 * Also mirrors `dist/lib/` into `harper-app/lib/` so harper resources can
 * safely `import { ... } from "../lib/..."` (e.g. the AdvisorSearchIndex
 * token query reuses the same `splitQueryTokens` / `normalizeQueryToken`
 * helpers the write-side reindex uses). Without this, Fabric refuses to
 * load `resources.js` because the relative `../lib/*.js` path resolves to
 * a directory that doesn't exist in the deployed component root.
 * @returns Promise that resolves after resource entrypoint and helpers are copied.
 */
async function copyHarperResources(): Promise<void> {
  await mkdir(HARPER_APP_DIR, { recursive: true });
  await cp("dist/harper", HARPER_APP_DIR, {
    recursive: true,
    filter: source => source.endsWith(".js") || !source.includes("."),
  });
  try {
    await cp("dist/lib", join(HARPER_APP_DIR, "lib"), {
      recursive: true,
      filter: source => source.endsWith(".js") || !source.includes("."),
    });
    // Rewrite parent-dir lib imports to same-dir lib imports inside
    // the component root. `dist/harper/foo.js`'s compiled
    // `../lib/bar.js` would otherwise resolve to `<repo-root>/lib/...`
    // (one level above `harper-app/`) because Node ESM follows the
    // file's real path, not the symlinked component path Fabric
    // expects. Pointing the same imports at `./lib/` keeps everything
    // within `harper-app/` so the deployed component is
    // self-contained.
    await rewriteParentLibImports(HARPER_APP_DIR);
  } catch (error) {
    throw new Error(
      `build: failed to mirror dist/lib → ${join(HARPER_APP_DIR, "lib")} and rewrite parent-lib imports (likely a missing dist/lib from a skipped tsc, or a FS permission error): ${String(error)}`,
      { cause: error }
    );
  }
}

/**
 * Replaces `from "../lib/..."` with `from "./lib/..."` in every JS file
 * directly under the Harper component root. The component root is flat —
 * the `lib/` mirror lives as a sibling of the resource files — so the
 * rewrite is shallow by design (we deliberately do not recurse into
 * `web/` or `node_modules/`).
 * @param dir - Component root containing the copied harper resources.
 * @returns Promise that resolves after all relevant imports are rewritten.
 */
async function rewriteParentLibImports(dir: string): Promise<void> {
  const importRe =
    /(\bfrom\s+["']|\bimport\s*\(\s*["']|\bimport\s+["'])\.\.\/lib\//g;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const path = join(dir, entry.name);
    const source = await readFile(path, "utf8");
    const rewritten = source.replace(importRe, "$1./lib/");
    if (rewritten !== source) await writeFile(path, rewritten);
  }
}

// Copies compiled Harper resources into the component root expected by Fabric.
const main = async (): Promise<void> => {
  await copyHarperResources();
  await copyGeneratedWeb();

  // tsc may leave empty source subdirectories in dist; keep dist readable.
  for (const dir of ["dist/harper", "dist/web"]) {
    try {
      const entries = await readdir(dir);
      if (entries.length === 0) await rm(dir, { recursive: true, force: true });
    } catch {
      // Directory cleanup is cosmetic.
    }
  }

  console.log(
    `built Harper JS resources into ${join(HARPER_APP_DIR, "resources.js")} and web/*.js`
  );
};

await main();
