import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WEB_ASSET_VERSION = "20260521-media";
const JS_IMPORT_RE =
  /(\bfrom\s+["']|\bimport\s*\(\s*["']|\bimport\s+["'])(\.{1,2}\/[^"']+\.js)(["'])/g;

async function copyGeneratedWeb(): Promise<void> {
  await mkdir("harper-app/web", { recursive: true });
  await cp("dist/web", "harper-app/web", {
    recursive: true,
    filter: source => source.endsWith(".js") || !source.includes("."),
  });
  await versionGeneratedWebModules("harper-app/web");
}

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

async function main(): Promise<void> {
  await mkdir("harper-app", { recursive: true });
  await cp("dist/harper/resources.js", "harper-app/resources.js");
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
    `built Harper JS resources into ${join("harper-app", "resources.js")} and web/*.js`
  );
}

await main();
