import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

async function copyGeneratedWeb(): Promise<void> {
  await mkdir("harper-app/web", { recursive: true });
  await cp("dist/src/web", "harper-app/web", {
    recursive: true,
    filter: source => source.endsWith(".js") || !source.includes("."),
  });
}

async function main(): Promise<void> {
  await mkdir("harper-app", { recursive: true });
  await cp("dist/src/harper/resources.js", "harper-app/resources.js");
  await copyGeneratedWeb();

  // tsc may leave empty source subdirectories in dist; keep dist readable.
  for (const dir of ["dist/src/harper", "dist/src/web"]) {
    try {
      const entries = await readdir(dir);
      if (entries.length === 0) await rm(dir, { recursive: true, force: true });
    } catch {
      // Directory cleanup is cosmetic.
    }
  }

  console.log(`built Harper JS resources into ${join("harper-app", "resources.js")} and web/*.js`);
}

await main();
