#!/usr/bin/env node
// @ts-nocheck
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

/** Entity kinds with media fields supported by the backfill. */
type MediaMode = "advisor" | "firm";
/** CLI target values accepted by `--target`. */
type TargetKind = "advisors" | "firms" | "all";
/** Untyped Harper row returned by the deployed REST resources. */
type Row = Readonly<Record<string, unknown>>;

/**
 * Reads one CLI option by name.
 * @param name - Flag name such as `--max`.
 * @returns Option value or undefined when absent.
 */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Checks whether a boolean CLI flag was supplied.
 * @param name - Flag name such as `--write`.
 * @returns True when present in argv.
 */
function has(name: string): boolean {
  return process.argv.includes(name);
}

/**
 * Pauses between search and fetch requests.
 * @param ms - Delay in milliseconds.
 * @returns Promise that resolves after the delay.
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses the target entity kind requested for the backfill.
 * @returns Advisor, firm, or all target selection.
 */
function targetKind(): TargetKind {
  const value = arg("--target") ?? "all";
  if (value === "advisors" || value === "firms" || value === "all")
    return value;
  throw new Error("--target must be advisors, firms, or all");
}

/**
 * Selects the display name field for the entity kind being enriched.
 * @param row - Advisor or firm row from Harper.
 * @param mode - Entity media mode.
 * @returns Name used for search queries.
 */
function nameFor(row: Row, mode: MediaMode): string {
  const value = mode === "advisor" ? row.legalName : row.name;
  return typeof value === "string" ? value : "";
}

/**
 * Selects the destination media URL field for the entity kind.
 * @param mode - Entity media mode.
 * @returns Harper field that stores the discovered media URL.
 */
function mediaField(mode: MediaMode): string {
  return mode === "advisor" ? "headshotUrl" : "logoUrl";
}

/**
 * Removes common legal suffixes that make firm logo searches worse.
 * @param name - Firm display or legal name.
 * @returns Search-friendly firm name.
 */
function cleanFirmSearchName(name: string): string {
  const normalized = name.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const suffixes = new Set([
    "inc",
    "incorporated",
    "llc",
    "ltd",
    "lp",
    "corp",
    "corporation",
  ]);
  const words = normalized.split(" ");
  return suffixes.has(words.at(-1)?.toLowerCase() ?? "")
    ? words.slice(0, -1).join(" ")
    : normalized;
}

/**
 * Builds a search query tuned for advisor headshots or firm logos.
 * @param row - Advisor or firm row from Harper.
 * @param mode - Entity media mode.
 * @returns DuckDuckGo search query.
 */
function searchQuery(row: Row, mode: MediaMode): string {
  const name = nameFor(row, mode);
  if (mode === "firm") return `"${cleanFirmSearchName(name)}" logo official`;
  const firmName = row._currentFirmName;
  const firmHint = typeof firmName === "string" ? ` "${firmName}"` : "";
  return `"${name}"${firmHint} financial advisor headshot`;
}

/**
 * Rejects search-result hosts that are usually gated directories or social pages.
 * @param url - Candidate source page URL.
 * @returns True when the page is worth fetching.
 */
function sourceAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !BLOCKED_SOURCE_HOST_PATTERNS.some(pattern => pattern.test(host));
  } catch {
    return false;
  }
}

/**
 * Fetches text/html content with a short timeout.
 * @param url - URL to fetch.
 * @returns HTML text or null for failed/non-HTML responses.
 */
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

/**
 * Verifies that a discovered media URL is reachable as an image.
 * @param url - Candidate image URL.
 * @returns True when the URL appears to serve image content.
 */
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
    return imageExtensionFallback(url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Falls back to extension checks when HEAD requests are blocked.
 * @param url - Candidate image URL.
 * @returns True when the URL path ends in a known image extension.
 */
function imageExtensionFallback(url: string): boolean {
  const path = url.split(/[?#]/u)[0].toLowerCase();
  return [".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"].some(
    extension => path.endsWith(extension)
  );
}

/**
 * Runs one DuckDuckGo HTML search and filters noisy source hosts.
 * @param query - Search query for advisor or firm media.
 * @returns Up to five source page URLs.
 */
async function search(query: string): Promise<ReadonlyArray<string>> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url);
  if (!html) return [];
  return parseDuckDuckGoResults(html).filter(sourceAllowed).slice(0, 5);
}

/**
 * Searches source pages and returns the first reachable high-confidence media URL.
 * @param row - Advisor or firm row from Harper.
 * @param mode - Entity media mode.
 * @returns Best media candidate or null when none pass validation.
 */
async function discoverMedia(row: Row, mode: MediaMode) {
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

/**
 * Loads rows from one Harper table through the REST facade.
 * @param table - Harper table name.
 * @param token - Operation token for bearer auth.
 * @param baseUrl - Harper base URL.
 * @returns Table rows, or an empty array when the response shape is unexpected.
 */
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

/**
 * Adds current firm names to advisors so headshot queries include firm context.
 * @param advisors - Advisor rows missing headshots.
 * @param firms - Firm rows keyed by id.
 * @param employments - Employment rows used to find current firm.
 * @returns Advisor rows with `_currentFirmName` hints.
 */
function attachCurrentFirmNames(
  advisors: ReadonlyArray<Row>,
  firms: ReadonlyArray<Row>,
  employments: ReadonlyArray<Row>
) {
  const byFirm = new Map(firms.map(firm => [firm.id, firm]));
  return advisors.map(advisor => ({
    ...advisor,
    _currentFirmName: byFirm.get(
      currentEmployment(employments, advisor.id)?.firmId
    )?.name,
  }));
}

/**
 * Finds the latest current employment for one advisor.
 * @param employments - Employment rows loaded from Harper.
 * @param advisorId - Advisor id whose current firm should be found.
 * @returns Current employment row or undefined.
 */
function currentEmployment(
  employments: ReadonlyArray<Row>,
  advisorId: unknown
) {
  return employments
    .filter(row => row.advisorId === advisorId && !row.endDate)
    .sort((left, right) =>
      String(right.startDate ?? "").localeCompare(String(left.startDate ?? ""))
    )[0];
}

/**
 * Writes a media URL back to Harper when `--write` is supplied.
 * @param baseUrl - Harper base URL.
 * @param token - Operation token for bearer auth.
 * @param table - Destination Harper table.
 * @param row - Updated row payload.
 * @returns True when the REST write succeeds.
 */
async function updateRow(
  baseUrl: string,
  token: string,
  table: string,
  row: Row
) {
  return await restPut(baseUrl, table, row, `Bearer ${token}`);
}

/**
 * Processes selected rows sequentially to keep search and source requests polite.
 * @param input - Row selection, auth, and write options.
 * @param input.rows - Candidate rows loaded from Harper.
 * @param input.table - Harper table to update.
 * @param input.mode - Entity media mode.
 * @param input.baseUrl - Harper base URL.
 * @param input.token - Operation token for bearer auth.
 * @param input.max - Maximum number of rows to process.
 * @param input.write - Whether discovered media should be persisted.
 * @param input.delayMs - Delay between processed rows.
 * @returns Summary counts for scanned, found, and written rows.
 */
async function processRows(input) {
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
  const summary = await selected.reduce(
    async (previous, row) => processRow(input, field, row, await previous),
    Promise.resolve({ found: 0, written: 0 })
  );

  console.log(
    `${input.table} summary: scanned=${selected.length} found=${summary.found} written=${summary.written}`
  );
  return { scanned: selected.length, ...summary };
}

/**
 * Processes one advisor or firm media candidate.
 * @param input - Row processing options.
 * @param field - Destination media field for the row.
 * @param row - Selected advisor or firm row.
 * @param summary - Running summary counts.
 * @returns Updated summary counts.
 */
async function processRow(input, field, row, summary) {
  const name = nameFor(row, input.mode);
  const candidate = await discoverMedia(row, input.mode);
  if (!candidate) {
    console.log(`${input.table}\tMISS\t${name}`);
    await sleep(input.delayMs);
    return summary;
  }
  const written = input.write
    ? await updateMediaRow(input, field, row, candidate.url)
    : false;
  console.log(
    `${input.table}\tFOUND\t${name}\t${candidate.url}\t${candidate.sourceUrl}\tscore=${candidate.score}`
  );
  await sleep(input.delayMs);
  return {
    found: summary.found + 1,
    written: summary.written + (written ? 1 : 0),
  };
}

/**
 * Writes the discovered media URL to the selected row.
 * @param input - Row processing options.
 * @param field - Destination media field.
 * @param row - Selected advisor or firm row.
 * @param url - Discovered media URL.
 * @returns True when a write occurred and succeeded.
 */
function updateMediaRow(input, field, row, url) {
  return updateRow(input.baseUrl, input.token, input.table, {
    ...row,
    [field]: url,
  });
}

/**
 * Runs the media backfill CLI.
 * @returns Promise that resolves when selected targets complete.
 */
async function main() {
  const creds = loadCreds();
  const tokens = await createAuthTokens(creds);
  const baseUrl = stripTrailingSlashes(creds.clusterUrl);
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

/**
 * Removes trailing slashes without using backtracking-prone regexes.
 * @param value - URL string that may include trailing slash characters.
 * @returns URL without trailing slashes.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
