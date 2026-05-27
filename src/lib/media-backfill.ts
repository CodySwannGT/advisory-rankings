import {
  type MediaCandidate,
  extractMediaCandidates,
  parseDuckDuckGoResults,
} from "./media-enrichment.js";

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
export type MediaMode = "advisor" | "firm";

/** Untyped Harper row returned by the deployed REST resources. */
export type MediaRow = Readonly<Record<string, unknown>>;

/**
 * Selects the display name field for the entity kind being enriched.
 * @param row - Advisor or firm row from Harper.
 * @param mode - Entity media mode.
 * @returns Name used for search queries.
 */
export function nameFor(row: MediaRow, mode: MediaMode): string {
  const value = mode === "advisor" ? row.legalName : row.name;
  return typeof value === "string" ? value : "";
}

/**
 * Selects the destination media URL field for the entity kind.
 * @param mode - Entity media mode.
 * @returns Harper field that stores the discovered media URL.
 */
export function mediaField(mode: MediaMode): string {
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
function searchQuery(row: MediaRow, mode: MediaMode): string {
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
 * @param explicitSourceUrl - Optional override that skips the search phase.
 * @returns Best media candidate or null when none pass validation.
 */
export async function discoverMedia(
  row: MediaRow,
  mode: MediaMode,
  explicitSourceUrl: string | undefined
): Promise<MediaCandidate | null> {
  const name = nameFor(row, mode);
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
