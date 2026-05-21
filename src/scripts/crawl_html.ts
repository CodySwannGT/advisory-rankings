#!/usr/bin/env node
// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const out = process.argv[process.argv.indexOf("--out") + 1] || "research/html";
const sleepSeconds = Number(process.argv[process.argv.indexOf("--sleep") + 1] || "5");
const urlsFile = process.argv.find(arg => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]) ?? "urls.txt";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

await mkdir(out, { recursive: true });
const urls = (await readFile(urlsFile, "utf8")).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
for (const url of urls) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 advisory-rankings-research/0.1" } });
  const html = await res.text();
  const name = basename(new URL(url).pathname.replace(/\/$/, "")) || encodeURIComponent(url);
  await writeFile(join(out, `${name}.html`), html);
  console.error(`[html] ${res.status} ${url}`);
  await sleep(sleepSeconds * 1000);
}
