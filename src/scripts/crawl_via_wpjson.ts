#!/usr/bin/env node
// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

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

async function fetchJsonInBrowser(page: any, url: string): Promise<any> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  if (status < 200 || status >= 300) throw new Error(`${status} ${url}`);
  const body = await page.locator("body").innerText();
  return JSON.parse(body);
}

const out = opt("--out", "research/wpjson");
const maxPages = Number(opt("--max-pages", "0"));
const perPage = Number(opt("--per-page", "100"));
const sleepSeconds = Number(opt("--sleep", "6"));
const maxRequests = Number(opt("--max-requests", "0"));
const useBrowser = process.argv.includes("--browser");
let requests = 0;
let browser: any = undefined;
let page: any = undefined;

if (useBrowser) {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
  });
  page = await context.newPage();
}
try {
  for (const type of TYPES) {
    const dir = join(out, type);
    await mkdir(dir, { recursive: true });
    for (let pageNumber = 1; ; pageNumber++) {
      if (maxPages && pageNumber > maxPages) break;
      if (maxRequests && requests >= maxRequests) break;
      const url = `${BASE}/${type}?per_page=${perPage}&page=${pageNumber}&_embed=wp:featuredmedia`;
      try {
        const rows = useBrowser ? await fetchJsonInBrowser(page, url) : await fetchJson(url);
        requests++;
        if (!Array.isArray(rows) || rows.length === 0) break;
        for (const row of rows) {
          await writeFile(join(dir, `post_${row.id}.json`), `${JSON.stringify(row, null, 2)}\n`);
        }
        console.error(`[${type}] page ${pageNumber}: ${rows.length}`);
        await sleep(sleepSeconds * 1000);
      } catch (error) {
        console.error(`[${type}] stop page ${pageNumber}: ${String(error)}`);
        break;
      }
    }
  }
} finally {
  await browser?.close();
}

console.error(`\n[done] ${requests} requests made`);
