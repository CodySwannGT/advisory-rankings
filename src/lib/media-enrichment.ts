/* eslint-disable functional/immutable-data, functional/no-let, functional/prefer-readonly-type, functional/readonly-type, jsdoc/require-jsdoc, code-organization/enforce-statement-order -- HTML scraping uses mutable candidate scoring and compact helpers. */
import * as cheerio from "cheerio";

const GENERIC_IMAGE_PATTERNS = [
  /avatar/i,
  /blank/i,
  /default/i,
  /facebook/i,
  /favicon/i,
  /gravatar/i,
  /placeholder/i,
  /sprite/i,
  /twitter/i,
] as const;

/**
 * A candidate image discovered on a public page.
 */
export interface MediaCandidate {
  readonly url: string;
  readonly sourceUrl: string;
  readonly score: number;
  readonly reason: string;
}

/**
 * Convert a possibly-relative URL into an absolute HTTP(S) URL.
 * @param raw URL string from HTML.
 * @param base Source page URL.
 * @returns Absolute URL, or null when unusable.
 */
export function absoluteHttpUrl(raw: string | undefined, base: string) {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract the original target from a DuckDuckGo HTML result URL.
 * @param raw Result href.
 * @returns Decoded target URL when present.
 */
export function unwrapDuckDuckGoUrl(raw: string): string {
  const url = new URL(raw, "https://duckduckgo.com");
  const wrapped = url.searchParams.get("uddg");
  return wrapped ? decodeURIComponent(wrapped) : url.toString();
}

/**
 * Extract candidate search-result links from DuckDuckGo's HTML endpoint.
 * @param html DuckDuckGo HTML search result page.
 * @returns Ordered result URLs.
 */
export function parseDuckDuckGoResults(html: string): string[] {
  const $ = cheerio.load(html);
  return $(".result__a")
    .toArray()
    .map(element => $(element).attr("href"))
    .filter((href): href is string => Boolean(href))
    .map(unwrapDuckDuckGoUrl)
    .filter(url => /^https?:\/\//.test(url));
}

function textScore(
  value: string,
  targetName: string,
  mode: "advisor" | "firm"
) {
  const text = value.toLowerCase();
  const nameTokens = targetName.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  if (mode === "firm" && /\blogo\b/.test(text)) score += 4;
  if (mode === "advisor" && /\b(headshot|portrait|profile)\b/.test(text)) {
    score += 4;
  }
  for (const token of nameTokens) {
    if (token.length > 2 && text.includes(token)) score += 1;
  }
  return score;
}

function isGenericImage(url: string): boolean {
  return GENERIC_IMAGE_PATTERNS.some(pattern => pattern.test(url));
}

function pushCandidate(
  candidates: MediaCandidate[],
  input: {
    readonly rawUrl: string | undefined;
    readonly sourceUrl: string;
    readonly score: number;
    readonly reason: string;
  }
) {
  const url = absoluteHttpUrl(input.rawUrl, input.sourceUrl);
  if (!url || isGenericImage(url)) return;
  candidates.push({
    url,
    sourceUrl: input.sourceUrl,
    score: input.score,
    reason: input.reason,
  });
}

/**
 * Find likely advisor headshot or firm logo URLs in an HTML page.
 * @param html Source page HTML.
 * @param sourceUrl Source page URL.
 * @param targetName Advisor or firm name.
 * @param mode Whether to look for a headshot or logo.
 * @returns Highest-scoring candidates first.
 */
export function extractMediaCandidates(
  html: string,
  sourceUrl: string,
  targetName: string,
  mode: "advisor" | "firm"
): MediaCandidate[] {
  const $ = cheerio.load(html);
  const candidates: MediaCandidate[] = [];

  for (const selector of [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ]) {
    const rawUrl = $(selector).attr("content");
    pushCandidate(candidates, {
      rawUrl,
      sourceUrl,
      score: mode === "advisor" ? 3 : 2,
      reason: selector,
    });
  }

  if (mode === "firm") {
    for (const selector of [
      'link[rel~="apple-touch-icon"]',
      'link[rel~="icon"]',
    ]) {
      const rawUrl = $(selector).attr("href");
      pushCandidate(candidates, {
        rawUrl,
        sourceUrl,
        score: 3,
        reason: selector,
      });
    }
  }

  $("img").each((_, element) => {
    const img = $(element);
    const rawUrl =
      img.attr("src") ?? img.attr("data-src") ?? img.attr("data-lazy-src");
    const descriptor = [
      img.attr("alt"),
      img.attr("class"),
      img.attr("id"),
      rawUrl,
    ]
      .filter(Boolean)
      .join(" ");
    const score = textScore(descriptor, targetName, mode);
    if (score === 0) return;
    pushCandidate(candidates, {
      rawUrl,
      sourceUrl,
      score,
      reason: `img:${descriptor.slice(0, 120)}`,
    });
  });

  const byUrl = new Map<string, MediaCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.score > existing.score) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return [...byUrl.values()].sort((left, right) => right.score - left.score);
}

/* eslint-enable functional/immutable-data, functional/no-let, functional/prefer-readonly-type, functional/readonly-type, jsdoc/require-jsdoc, code-organization/enforce-statement-order -- End scraper utility exception. */
