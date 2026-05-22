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
interface MediaCandidate {
  readonly url: string;
  readonly sourceUrl: string;
  readonly score: number;
  readonly reason: string;
}

/**
 * Raw media reference and scoring metadata before URL validation.
 */
interface MediaCandidateInput {
  readonly rawUrl: string | undefined;
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
    return url.toString().split("#")[0];
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
export function parseDuckDuckGoResults(html: string): ReadonlyArray<string> {
  const $ = cheerio.load(html);
  return $(".result__a")
    .toArray()
    .map(element => $(element).attr("href"))
    .filter((href): href is string => Boolean(href))
    .map(unwrapDuckDuckGoUrl)
    .filter(url => /^https?:\/\//.test(url));
}

/**
 * Scores descriptive text for whether it likely points at the target media.
 * @param value - Image attributes and URL text.
 * @param targetName - Advisor or firm name being enriched.
 * @param mode - Determines which media hints receive extra weight.
 * @returns Numeric relevance score.
 */
function textScore(
  value: string,
  targetName: string,
  mode: "advisor" | "firm"
) {
  const text = value.toLowerCase();
  const nameTokens = targetName.toLowerCase().split(/\s+/).filter(Boolean);
  const modeScore =
    (mode === "firm" && /\blogo\b/.test(text)) ||
    (mode === "advisor" && /\b(headshot|portrait|profile)\b/.test(text))
      ? 4
      : 0;
  const tokenScore = nameTokens.filter(
    token => token.length > 2 && text.includes(token)
  ).length;
  return modeScore + tokenScore;
}

/**
 * Filters out known placeholder, sprite, and social-media image URLs.
 * @param url - Absolute image URL candidate.
 * @returns True when the URL looks too generic to be useful.
 */
function isGenericImage(url: string): boolean {
  return GENERIC_IMAGE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Creates a media candidate when the raw URL is usable and specific.
 * @param input - Raw media reference and scoring metadata.
 * @param input.rawUrl - Image URL as it appeared in HTML.
 * @param input.sourceUrl - Page URL used to resolve relative paths.
 * @param input.score - Candidate relevance score.
 * @param input.reason - Selector or image descriptor that produced the row.
 * @returns Candidate row or null when the image should be ignored.
 */
function mediaCandidate(input: MediaCandidateInput) {
  const url = absoluteHttpUrl(input.rawUrl, input.sourceUrl);
  return !url || isGenericImage(url)
    ? null
    : {
        url,
        sourceUrl: input.sourceUrl,
        score: input.score,
        reason: input.reason,
      };
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
): ReadonlyArray<MediaCandidate> {
  const $ = cheerio.load(html);
  const candidates = [
    ...metadataCandidates($, sourceUrl, mode),
    ...imageCandidates($, sourceUrl, targetName, mode),
  ];
  return bestCandidatesByUrl(candidates);
}

/**
 * Reads Open Graph, Twitter, and icon metadata that often contains media.
 * @param $ - Cheerio document loaded from the source page.
 * @param sourceUrl - Page URL where candidates were found.
 * @param mode - Advisor headshot or firm logo mode.
 * @returns Candidate media rows from page metadata.
 */
function metadataCandidates(
  $: ReturnType<typeof cheerio.load>,
  sourceUrl: string,
  mode: "advisor" | "firm"
) {
  const imageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ];
  const iconSelectors =
    mode === "firm"
      ? ['link[rel~="apple-touch-icon"]', 'link[rel~="icon"]']
      : [];
  const imageRows = imageSelectors.map(selector =>
    mediaCandidate({
      rawUrl: $(selector).attr("content"),
      sourceUrl,
      score: mode === "advisor" ? 3 : 2,
      reason: selector,
    })
  );
  const iconRows = iconSelectors.map(selector =>
    mediaCandidate({
      rawUrl: $(selector).attr("href"),
      sourceUrl,
      score: 3,
      reason: selector,
    })
  );
  return [...imageRows, ...iconRows].filter(isMediaCandidate);
}

/**
 * Scores ordinary `<img>` tags using alt/class/id/url hints.
 * @param $ - Cheerio document loaded from the source page.
 * @param sourceUrl - Page URL where candidates were found.
 * @param targetName - Advisor or firm name being enriched.
 * @param mode - Advisor headshot or firm logo mode.
 * @returns Candidate media rows from image tags.
 */
function imageCandidates(
  $: ReturnType<typeof cheerio.load>,
  sourceUrl: string,
  targetName: string,
  mode: "advisor" | "firm"
) {
  return $("img")
    .toArray()
    .map((element: Parameters<ReturnType<typeof cheerio.load>>[0]) => {
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
      return score === 0
        ? null
        : mediaCandidate({
            rawUrl,
            sourceUrl,
            score,
            reason: `img:${descriptor.slice(0, 120)}`,
          });
    })
    .filter(isMediaCandidate);
}

/**
 * Narrows optional candidate results after URL validation.
 * @param candidate - Candidate or null from URL validation.
 * @returns True when a valid candidate remains.
 */
function isMediaCandidate(
  candidate: MediaCandidate | null
): candidate is MediaCandidate {
  return Boolean(candidate);
}

/**
 * Keeps only the highest-scoring candidate for each image URL.
 * @param candidates - Candidate rows from metadata and image tags.
 * @returns De-duplicated candidates ordered from strongest to weakest.
 */
function bestCandidatesByUrl(candidates: ReadonlyArray<MediaCandidate>) {
  return candidates
    .filter(
      candidate => bestCandidateForUrl(candidates, candidate.url) === candidate
    )
    .sort((left, right) => right.score - left.score);
}

/**
 * Finds the strongest candidate for one URL while preserving first-match ties.
 * @param candidates - Candidate rows from the page.
 * @param url - Absolute image URL to evaluate.
 * @returns Best candidate for that URL.
 */
function bestCandidateForUrl(
  candidates: ReadonlyArray<MediaCandidate>,
  url: string
) {
  return candidates
    .filter(candidate => candidate.url === url)
    .sort((left, right) => right.score - left.score)[0];
}
