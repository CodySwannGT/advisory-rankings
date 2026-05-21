#!/usr/bin/env node
// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://www.advisorhub.com/wp-json/wp/v2";
const TYPES = ["posts", "recruiting_moves", "firm", "team_bio"];

function opt(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "advisory-rankings-research/0.1",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}

const out = opt("--out", "research/wpjson");
const maxPages = Number(opt("--max-pages", "0"));
const perPage = Number(opt("--per-page", "100"));
const sleepSeconds = Number(opt("--sleep", "6"));
const maxRequests = Number(opt("--max-requests", "0"));
let requests = 0;

for (const type of TYPES) {
  const dir = join(out, type);
  await mkdir(dir, { recursive: true });
  for (let page = 1; ; page++) {
    if (maxPages && page > maxPages) break;
    if (maxRequests && requests >= maxRequests) break;
    const url = `${BASE}/${type}?per_page=${perPage}&page=${page}`;
    try {
      const rows = await fetchJson(url);
      requests++;
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        await writeFile(join(dir, `post_${row.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
      }
      console.error(`[${type}] page ${page}: ${rows.length}`);
      await sleep(sleepSeconds * 1000);
    } catch (error) {
      console.error(`[${type}] stop page ${page}: ${String(error)}`);
      break;
    }
  }
}

console.error(`\n[done] ${requests} requests made`);
