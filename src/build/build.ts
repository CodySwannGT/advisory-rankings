import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WEB_ASSET_VERSION = "20260521-media";
const HARPER_WEB_DIR = "harper-app/web";
const HARPER_APP_DIR = "harper-app";
const PACKAGE_JSON = "package.json";
const JS_IMPORT_RE =
  /(\bfrom\s+["']|\bimport\s*\(\s*["']|\bimport\s+["'])(\.{1,2}\/[^"']+\.js)(["'])/g;

/** Minimal package fields needed for generated browser metadata. */
interface PackageManifest {
  readonly version?: string;
}

/**
 * Copies generated browser modules and adds cache-busting import versions.
 * @returns Promise that resolves after generated web files are deploy-ready.
 */
async function copyGeneratedWeb(): Promise<void> {
  await writeGeneratedVersionModule();
  await mkdir(HARPER_WEB_DIR, { recursive: true });
  await cp("dist/web", HARPER_WEB_DIR, {
    recursive: true,
    filter: source => source.endsWith(".js") || !source.includes("."),
  });
  await versionGeneratedWebModules(HARPER_WEB_DIR);
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
    join("dist/web", "version.js"),
    `export const APP_VERSION = ${JSON.stringify(version)};\n`
  );
}

/**
 * Rewrites relative JavaScript imports so browsers pick up fresh deploy assets.
 * @param dir - Directory to process recursively.
 * @returns Promise that resolves after all nested modules are rewritten.
 */
async function versionGeneratedWebModules(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await versionGeneratedWebModules(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const source = await readFile(path, "utf8");
    const versioned = source.replace(JS_IMPORT_RE, (match, prefix, specifier, suffix) => {
      if (specifier.includes("?")) return match;
      return `${prefix}${specifier}?v=${WEB_ASSET_VERSION}${suffix}`;
    });
    if (versioned !== source) await writeFile(path, versioned);
  }
}

/**
 * Copies all compiled Harper resource modules into the Fabric component root.
 * @returns Promise that resolves after resource entrypoint and helpers are copied.
 */
async function copyHarperResources(): Promise<void> {
  await mkdir(HARPER_APP_DIR, { recursive: true });
  await cp("dist/harper", HARPER_APP_DIR, {
    recursive: true,
    filter: source => source.endsWith(".js") || !source.includes("."),
  });
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
