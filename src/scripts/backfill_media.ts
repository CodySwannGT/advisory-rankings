#!/usr/bin/env node
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any, functional/immutable-data, functional/no-let, functional/prefer-readonly-type, functional/readonly-type, jsdoc/require-jsdoc, sonarjs/slow-regex -- CLI scraper code works with untyped Harper rows and mutable counters. */
import {
  extractMediaCandidates,
  parseDuckDuckGoResults,
} from "../lib/media-enrichment.js";
import { restPut } from "../lib/rest.js";
import { bearerHeaders, createAuthTokens, loadCreds } from "./_auth.js";

const USER_AGENT = "advisory-rankings-media-backfill/0.1";
const SEARCH_URL = "https://duckduckgo.com/html/";
const DEFAULT_MIN_SCORE = 5;
const BLOCKED_SOURCE_HOST_PATTERNS = [
  /dnb\.com$/i,
  /facebook\.com$/i,
  /linkedin\.com$/i,
  /rocketreach\.co$/i,
  /visualvisitor\.com$/i,
  /zoominfo\.com$/i,
] as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function targetKind(): "advisors" | "firms" | "all" {
  const value = arg("--target") ?? "all";
  if (["advisors", "firms", "all"].includes(value)) return value as any;
  throw new Error("--target must be advisors, firms, or all");
}

function nameFor(row: any, mode: "advisor" | "firm"): string {
  return mode === "advisor" ? (row.legalName ?? "") : (row.name ?? "");
}

function mediaField(mode: "advisor" | "firm"): string {
  return mode === "advisor" ? "headshotUrl" : "logoUrl";
}

function cleanFirmSearchName(name: string): string {
  return name
    .replace(
      /\s*,?\s*(inc|incorporated|llc|l\.l\.c\.|ltd|lp|corp|corporation)\.?$/i,
      ""
    )
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchQuery(row: any, mode: "advisor" | "firm"): string {
  const name = nameFor(row, mode);
  if (mode === "firm") return `"${cleanFirmSearchName(name)}" logo official`;
  const firmHint = row._currentFirmName ? ` "${row._currentFirmName}"` : "";
  return `"${name}"${firmHint} financial advisor headshot`;
}

function sourceAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !BLOCKED_SOURCE_HOST_PATTERNS.some(pattern => pattern.test(host));
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function isReachableImage(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    return type.startsWith("image/");
  } catch {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(url);
  } finally {
    clearTimeout(timer);
  }
}

async function search(query: string): Promise<string[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  if (!html) return [];
  return parseDuckDuckGoResults(html).filter(sourceAllowed).slice(0, 5);
}

async function discoverMedia(row: any, mode: "advisor" | "firm") {
  const name = nameFor(row, mode);
  const explicitSourceUrl = arg("--source-url");
  const urls = explicitSourceUrl
    ? [explicitSourceUrl]
    : await search(searchQuery(row, mode));
  for (const sourceUrl of urls) {
    const html = await fetchText(sourceUrl);
    if (!html) continue;
    const candidate = extractMediaCandidates(html, sourceUrl, name, mode)[0];
    if (!candidate || candidate.score < DEFAULT_MIN_SCORE) continue;
    if (!(await isReachableImage(candidate.url))) continue;
    return candidate;
  }
  return null;
}

async function getRows(
  table: "Advisor" | "Firm",
  token: string,
  baseUrl: string
) {
  const res = await fetch(`${baseUrl}/${table}/`, {
    headers: bearerHeaders(token),
  });
  if (!res.ok) throw new Error(`GET /${table}/ -> ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function attachCurrentFirmNames(
  advisors: any[],
  firms: any[],
  employments: any[]
) {
  const byFirm = new Map(firms.map(firm => [firm.id, firm]));
  const current = new Map<string, any>();
  for (const row of employments) {
    if (row.endDate) continue;
    const existing = current.get(row.advisorId);
    if (
      !existing ||
      String(row.startDate ?? "") > String(existing.startDate ?? "")
    ) {
      current.set(row.advisorId, row);
    }
  }
  return advisors.map(advisor => ({
    ...advisor,
    _currentFirmName: byFirm.get(current.get(advisor.id)?.firmId)?.name,
  }));
}

async function updateRow(
  baseUrl: string,
  token: string,
  table: string,
  row: any
) {
  return await restPut(baseUrl, table, row, `Bearer ${token}`);
}

async function processRows(input: {
  readonly rows: any[];
  readonly table: "Advisor" | "Firm";
  readonly mode: "advisor" | "firm";
  readonly baseUrl: string;
  readonly token: string;
  readonly max: number;
  readonly write: boolean;
  readonly delayMs: number;
}) {
  const field = mediaField(input.mode);
  const missing = input.rows.filter(
    row => row.id && nameFor(row, input.mode) && !row[field]
  );
  const nameFilter = arg("--name")?.toLowerCase();
  const filtered = nameFilter
    ? missing.filter(row =>
        nameFor(row, input.mode).toLowerCase().includes(nameFilter)
      )
    : missing;
  const selected = input.max > 0 ? filtered.slice(0, input.max) : filtered;
  let found = 0;
  let written = 0;

  for (const row of selected) {
    const name = nameFor(row, input.mode);
    const candidate = await discoverMedia(row, input.mode);
    if (!candidate) {
      console.log(`${input.table}\tMISS\t${name}`);
      await sleep(input.delayMs);
      continue;
    }
    found++;
    console.log(
      `${input.table}\tFOUND\t${name}\t${candidate.url}\t${candidate.sourceUrl}\tscore=${candidate.score}`
    );
    if (input.write) {
      const ok = await updateRow(input.baseUrl, input.token, input.table, {
        ...row,
        [field]: candidate.url,
      });
      if (ok) written++;
    }
    await sleep(input.delayMs);
  }

  console.log(
    `${input.table} summary: scanned=${selected.length} found=${found} written=${written}`
  );
}

async function main() {
  const creds = loadCreds();
  const tokens = await createAuthTokens(creds);
  const baseUrl = creds.clusterUrl.replace(/\/+$/, "");
  const token = tokens.operation_token;
  const max = Number(arg("--max") ?? "10");
  const delayMs = Number(arg("--delay-ms") ?? "1500");
  const write = has("--write");
  const target = targetKind();

  const [advisors, firms, employments] = await Promise.all([
    getRows("Advisor", token, baseUrl),
    getRows("Firm", token, baseUrl),
    getRows("EmploymentHistory", token, baseUrl).catch(() => []),
  ]);

  if (target === "advisors" || target === "all") {
    await processRows({
      rows: attachCurrentFirmNames(advisors, firms, employments),
      table: "Advisor",
      mode: "advisor",
      baseUrl,
      token,
      max,
      write,
      delayMs,
    });
  }
  if (target === "firms" || target === "all") {
    await processRows({
      rows: firms,
      table: "Firm",
      mode: "firm",
      baseUrl,
      token,
      max,
      write,
      delayMs,
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

/* eslint-enable @typescript-eslint/no-explicit-any, functional/immutable-data, functional/no-let, functional/prefer-readonly-type, functional/readonly-type, jsdoc/require-jsdoc, sonarjs/slow-regex -- End CLI scraper exception. */
