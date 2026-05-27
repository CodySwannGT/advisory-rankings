#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

/**
 * Running count of WordPress REST requests made during a crawl.
 */
interface CrawlState {
  readonly requests: number;
}

/**
 * Inputs threaded through each recursive `crawlPage` call.
 */
interface CrawlPageInput {
  readonly type: string;
  readonly dir: string;
  readonly page: number;
  readonly requests: number;
}

/**
 * Minimal shape required from a WordPress REST row to write a fixture.
 */
interface WpRow {
  readonly id: number | string;
  readonly [key: string]: unknown;
}

/**
 * Result of applying the optional `--since` cutoff to one page of rows.
 */
interface FreshRowsResult {
  readonly freshRows: ReadonlyArray<WpRow>;
  readonly reachedSince: boolean;
}

const BASE = "https://www.advisorhub.com/wp-json/wp/v2";
const TYPES = ["posts", "recruiting_moves", "firm", "team_bio"];
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

/**
 * Reads a named CLI option, falling back when the flag is absent.
 * @param name - Flag name such as `--out`.
 * @param fallback - Value used when the flag is not present.
 * @returns CLI value or fallback.
 */
function opt(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/**
 * Checks whether a boolean CLI flag was provided.
 * @param name - Flag name such as `--browser`.
 * @returns True when the flag appears in argv.
 */
function flag(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Waits between WordPress requests to avoid hammering AdvisorHub.
 * @param ms - Pause length in milliseconds.
 * @returns Promise that resolves after the pause.
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses the `--since` lower bound as a UTC day.
 * @param value - ISO date without time.
 * @returns Date at UTC midnight, or undefined when the option is empty.
 */
function parseSince(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()))
    throw new Error(`invalid --since date: ${value}`);
  return date;
}

/**
 * Extracts the publication date field emitted by WordPress REST rows.
 * @param row - WordPress row with `date_gmt` or `date`.
 * @returns Parsed publication date, or undefined when unavailable.
 */
function rowDate(row: Record<string, unknown>): Date | undefined {
  const value =
    typeof row.date_gmt === "string" ? `${row.date_gmt}Z` : row.date;
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Fetches one WordPress REST page with AdvisorHub-compatible headers.
 * @param url - WordPress REST page URL.
 * @param userAgent - Browser-like user agent sent to AdvisorHub.
 * @returns Parsed JSON payload.
 */
async function fetchJson(url: string, userAgent: string): Promise<unknown> {
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
 * Fetches one WordPress REST page through Playwright when direct fetch is blocked.
 * @param url - WordPress REST page URL.
 * @param page - Playwright page with AdvisorHub-compatible context.
 * @returns Parsed JSON payload.
 */
async function fetchJsonWithBrowser(url: string, page: Page): Promise<unknown> {
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

const browser = useBrowser
  ? await chromium.launch({ headless: true })
  : undefined;
const context = browser ? await browser.newContext({ userAgent }) : undefined;
const browserPage = context ? await context.newPage() : undefined;

try {
  const finalState = await crawlTypes({ requests: 0 });
  console.error(`\n[done] ${finalState.requests} requests made`);
} finally {
  await browser?.close();
}

/**
 * Crawls each configured WordPress type in order.
 * @param state - Running request count carried across types.
 * @returns Final request count.
 */
async function crawlTypes(state: CrawlState): Promise<CrawlState> {
  return TYPES.reduce<Promise<CrawlState>>(
    async (previous, type) => crawlType(type, await previous),
    Promise.resolve(state)
  );
}

/**
 * Prepares the output directory for one WordPress content type.
 * @param type - WordPress endpoint segment.
 * @param state - Running request count carried across types.
 * @returns Updated request count after this type completes.
 */
async function crawlType(type: string, state: CrawlState): Promise<CrawlState> {
  const dir = join(out, type);
  await mkdir(dir, { recursive: true });
  return crawlPage({ type, dir, page: 1, requests: state.requests });
}

/**
 * Recursively crawls WordPress pages until limits, empty rows, or since cutoff.
 * @param input - Crawl state for the current page.
 * @returns Updated request count after the page and its descendants complete.
 */
async function crawlPage(input: CrawlPageInput): Promise<CrawlState> {
  if (shouldStop(input)) return { requests: input.requests };
  const url = `${BASE}/${input.type}?per_page=${perPage}&page=${input.page}&_embed=wp:featuredmedia`;
  try {
    const payload = await readRows(url);
    const requests = input.requests + 1;
    const rows = toWpRows(payload);
    if (rows.length === 0) return { requests };
    const { freshRows, reachedSince } = filterFreshRows(rows);
    await writeRows(input.dir, freshRows);
    console.error(
      pageSummary(
        input.type,
        input.page,
        freshRows.length,
        rows.length,
        reachedSince
      )
    );
    if (reachedSince) return { requests };
    await sleep(sleepSeconds * 1000);
    return crawlPage({ ...input, page: input.page + 1, requests });
  } catch (error) {
    console.error(`[${input.type}] stop page ${input.page}: ${String(error)}`);
    return { requests: input.requests };
  }
}

/**
 * Narrows an unknown WordPress payload into typed rows.
 * @param payload - Parsed JSON returned by fetch or browser fallback.
 * @returns Typed rows when payload is an array, otherwise empty.
 */
function toWpRows(payload: unknown): ReadonlyArray<WpRow> {
  if (!Array.isArray(payload)) return [];
  return payload.filter(isWpRow);
}

/**
 * Type guard that confirms a parsed JSON value looks like a WordPress row.
 * @param value - Single element from the WordPress REST response array.
 * @returns True when the value has an `id` field of `number` or `string`.
 */
function isWpRow(value: unknown): value is WpRow {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value)) return false;
  const { id } = value;
  return typeof id === "number" || typeof id === "string";
}

/**
 * Checks configured page and request limits before each request.
 * @param input - Crawl state for the current page.
 * @returns True when no more requests should be made.
 */
function shouldStop(input: CrawlPageInput): boolean {
  return Boolean(
    (maxPages && input.page > maxPages) ||
    (maxRequests && input.requests >= maxRequests)
  );
}

/**
 * Reads one page with either direct fetch or browser fallback.
 * @param url - WordPress REST page URL.
 * @returns Parsed JSON payload.
 */
function readRows(url: string): Promise<unknown> {
  return browserPage
    ? fetchJsonWithBrowser(url, browserPage)
    : fetchJson(url, userAgent);
}

/**
 * Applies the optional `--since` cutoff without mutating loop state.
 * @param rows - WordPress rows returned for one page.
 * @returns Rows to write and whether the cutoff was reached.
 */
function filterFreshRows(rows: ReadonlyArray<WpRow>): FreshRowsResult {
  if (!since) return { freshRows: rows, reachedSince: false };
  const cutoff = since;
  const freshRows = rows.filter(row => {
    const date = rowDate(row);
    return !date || date >= cutoff;
  });
  return {
    freshRows,
    reachedSince: rows.some(row => {
      const date = rowDate(row);
      return Boolean(date && date < cutoff);
    }),
  };
}

/**
 * Persists each fetched WordPress row as an individual JSON fixture.
 * @param dir - Output directory for the content type.
 * @param rows - Fresh rows that passed the optional cutoff.
 * @returns Promise that resolves when all rows are written.
 */
function writeRows(
  dir: string,
  rows: ReadonlyArray<WpRow>
): Promise<ReadonlyArray<void>> {
  return Promise.all(
    rows.map(row =>
      writeFile(
        join(dir, `post_${row.id}.json`),
        `${JSON.stringify(row, null, 2)}\n`
      )
    )
  );
}

/**
 * Formats one progress line for stderr logs.
 * @param type - WordPress endpoint segment.
 * @param page - Page number fetched.
 * @param freshCount - Rows retained after cutoff filtering.
 * @param totalCount - Rows returned by WordPress.
 * @param reachedSince - Whether the since cutoff stopped this type.
 * @returns Human-readable progress summary.
 */
function pageSummary(
  type: string,
  page: number,
  freshCount: number,
  totalCount: number,
  reachedSince: boolean
): string {
  return `[${type}] page ${page}: ${freshCount}/${totalCount}${
    reachedSince ? " (since cutoff reached)" : ""
  }`;
}
