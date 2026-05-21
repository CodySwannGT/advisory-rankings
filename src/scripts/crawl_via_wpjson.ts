#!/usr/bin/env node
/* eslint-disable jsdoc/require-description, jsdoc/require-returns, jsdoc/require-param-description, @typescript-eslint/no-explicit-any, functional/no-let -- This legacy crawler was outside lint coverage before the Lisa ignore refresh; keep this PR scoped to browser backfill support. */
// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = "https://www.advisorhub.com/wp-json/wp/v2";
const TYPES = ["posts", "recruiting_moves", "firm", "team_bio"];
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

/**
 *
 * @param name
 * @param fallback
 */
function opt(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/**
 *
 * @param name
 */
function flag(name: string): boolean {
  return process.argv.includes(name);
}

/**
 *
 * @param ms
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 *
 * @param value
 */
function parseSince(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new Error(`invalid --since date: ${value}`);
  return date;
}

/**
 *
 * @param row
 */
function rowDate(row: Record<string, unknown>): Date | undefined {
  const value =
    typeof row.date_gmt === "string" ? `${row.date_gmt}Z` : row.date;
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 *
 * @param url
 * @param userAgent
 */
async function fetchJson(url: string, userAgent: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.advisorhub.com/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": userAgent,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}

/**
 *
 * @param url
 * @param page
 */
async function fetchJsonWithBrowser(url: string, page): Promise<any> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (!response?.ok())
    throw new Error(`${response?.status() ?? "no-response"} ${url}`);
  const body = await page.locator("body").innerText();
  return JSON.parse(body);
}

const out = opt("--out", "research/wpjson");
const maxPages = Number(opt("--max-pages", "0"));
const perPage = Number(opt("--per-page", "100"));
const sleepSeconds = Number(opt("--sleep", "6"));
const maxRequests = Number(opt("--max-requests", "0"));
const userAgent = opt(
  "--user-agent",
  process.env.ADVISORHUB_USER_AGENT ?? DEFAULT_USER_AGENT
);
const useBrowser = flag("--browser");
const since = parseSince(opt("--since", ""));
let requests = 0;

const browser = useBrowser
  ? await chromium.launch({ headless: true })
  : undefined;
const context = browser ? await browser.newContext({ userAgent }) : undefined;
const browserPage = context ? await context.newPage() : undefined;

try {
  for (const type of TYPES) {
    const dir = join(out, type);
    await mkdir(dir, { recursive: true });
    let reachedSince = false;
    for (let page = 1; ; page++) {
      if (maxPages && page > maxPages) break;
      if (maxRequests && requests >= maxRequests) break;
      if (reachedSince) break;
      const url = `${BASE}/${type}?per_page=${perPage}&page=${page}&_embed=wp:featuredmedia`;
      try {
        const rows = browserPage
          ? await fetchJsonWithBrowser(url, browserPage)
          : await fetchJson(url, userAgent);
        requests++;
        if (!Array.isArray(rows) || rows.length === 0) break;
        const freshRows = since
          ? rows.filter(row => {
              const date = rowDate(row);
              if (date && date < since) reachedSince = true;
              return !date || date >= since;
            })
          : rows;
        for (const row of freshRows) {
          await writeFile(
            join(dir, `post_${row.id}.json`),
            `${JSON.stringify(row, null, 2)}\n`
          );
        }
        console.error(
          `[${type}] page ${page}: ${freshRows.length}/${rows.length}${
            reachedSince ? " (since cutoff reached)" : ""
          }`
        );
        if (!reachedSince) await sleep(sleepSeconds * 1000);
      } catch (error) {
        console.error(`[${type}] stop page ${page}: ${String(error)}`);
        break;
      }
    }
  }
} finally {
  await browser?.close();
}

console.error(`\n[done] ${requests} requests made`);
/* eslint-enable jsdoc/require-description, jsdoc/require-returns, jsdoc/require-param-description, @typescript-eslint/no-explicit-any, functional/no-let -- Re-enable rules disabled for this legacy crawler file. */
