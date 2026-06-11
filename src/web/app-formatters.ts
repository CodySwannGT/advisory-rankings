// AdvisorBook — display formatters shared by every page.
//
// Split out of `app.ts` so the auth/REST/route module stays focused.
// Pages should import these via the `app.js` barrel re-exports (or
// directly from this module) — both paths point at the same functions.

import { fmtMoney, type FmtMoneyOptions } from "./app-money-formatters.js";

export { fmtMoney, type FmtMoneyOptions };

/**
 * Formats a 0–1 fraction as a whole-percent string.
 * @param p - Fraction value (0–1), or null/undefined for "—".
 * @returns Percent label, e.g. `"45%"`.
 */
export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(0)}%`;
}

/** Supported date-rendering modes for {@link fmtDate}. */
export type FmtDateMode = "long" | "short" | "rel";

/** Optional mode selector for {@link fmtDate}. */
export interface FmtDateOptions {
  readonly mode?: FmtDateMode;
}

/** Inputs accepted by {@link fmtDate}. */
export type FmtDateInput = string | number | Date | null | undefined;

/**
 * Formats a date input into a long, short, or relative label. Returns
 * the raw input when it can't be parsed so bad data is surfaced rather
 * than displayed as the epoch.
 * @param d - Date value, ISO string, or epoch ms.
 * @param options - Formatting options.
 * @param options.mode - Rendering mode (`"long"` default, `"short"`,
 *                       `"rel"`).
 * @returns Localized date label.
 */
export function fmtDate(
  d: FmtDateInput,
  { mode = "long" }: FmtDateOptions = {}
): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  if (mode === "short") return shortDate(dt);
  if (mode === "rel") return relativeDate(dt);
  return longDate(dt);
}

/**
 * Formats a compact UTC month/year label.
 * @param date - Valid Date object.
 * @returns Short date label.
 */
function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Formats a date as a relative age from today.
 * @param date - Valid Date object.
 * @returns Relative date label.
 */
function relativeDate(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const day = 86400000;
  if (diffMs < day) return "today";
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
  if (diffMs < 365 * day) return `${Math.floor(diffMs / (30 * day))}mo ago`;
  return `${Math.floor(diffMs / (365 * day))}y ago`;
}

/**
 * Formats a full UTC date label.
 * @param date - Valid Date object.
 * @returns Long date label.
 */
function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

const ACRONYM_LABELS: ReadonlyMap<string, string> = new Map([
  ["ria", "RIA"],
  ["ia", "IA"],
  ["bd", "BD"],
  ["finra", "FINRA"],
  ["sec", "SEC"],
  ["iard", "IARD"],
  ["crd", "CRD"],
  ["advisorhub", "AdvisorHub"],
  ["usa", "USA"],
  ["llc", "LLC"],
  ["lp", "LP"],
  ["lpl", "LPL"],
  ["ubs", "UBS"],
  ["rbc", "RBC"],
  ["uhnw", "UHNW"],
  ["jp", "J.P."],
  ["jpmorgan", "J.P. Morgan"],
  ["aum", "AUM"],
]);

/**
 * Detects placeholder strings (`unknown`, `n/a`, …) the seed data uses
 * for absent fields, so the UI can render an em-dash instead of the
 * literal token.
 * @param value - Raw value to normalize or parse.
 * @returns True when the value should be treated as missing.
 */
export function isPlaceholderValue(value: unknown): boolean {
  return (
    value == null || PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase())
  );
}

/**
 * Converts a snake_case / camelCase / PascalCase identifier into a
 * sentence-cased label, preserving known acronyms. All-uppercase tokens
 * (FINRA, SEC, LLC, …) and already-spaced strings pass through unchanged
 * so we don't mangle acronyms.
 * @param s - Raw identifier or null/undefined.
 * @returns Display label, the original string when already humanized, or
 *          null for placeholder values.
 */
export function humanize(s: unknown): string | null | undefined {
  if (s == null) return s as null | undefined;
  const str = String(s);
  if (!str) return str;
  if (isPlaceholderValue(str)) return null;
  if (str.includes(" ")) return str;
  if (/[A-Z]/.test(str) && str === str.toUpperCase()) return str;
  const spaced = str
    .replace(/_+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return spaced
    .split(" ")
    .map(
      word =>
        ACRONYM_LABELS.get(word) || word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

/**
 * Reduces a display name to one- or two-character initials for use in
 * avatar fallbacks.
 * @param name - Display name or option name.
 * @returns Initials, or "?" when the name is unusable.
 */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Map an article URL hostname to the publisher we want to attribute
// the post to in the UI. Most articles in this DB are AdvisorHub posts;
// firm-bio articles (Morgan Stanley, Wells Fargo, Edward Jones, …) are
// minted by the upsert-advisor skill against the firm's public
// advisor-locator and need a different label + initials.

/** Publisher attribution for a recognised article host. */
interface PublisherAttribution {
  readonly source: string;
  readonly initials: string;
}

const PUBLISHER_BY_HOST: Readonly<Record<string, PublisherAttribution>> = {
  "www.advisorhub.com": { source: "AdvisorHub", initials: "AH" },
  "advisorhub.com": { source: "AdvisorHub", initials: "AH" },
  "advisor.morganstanley.com": { source: "Morgan Stanley", initials: "MS" },
  "www.morganstanley.com": { source: "Morgan Stanley", initials: "MS" },
  "fa.wellsfargoadvisors.com": { source: "Wells Fargo", initials: "WF" },
  "www.wellsfargoadvisors.com": { source: "Wells Fargo", initials: "WF" },
  "www.edwardjones.com": { source: "Edward Jones", initials: "EJ" },
  "www.merrilledge.com": { source: "Merrill", initials: "ML" },
  "www.ml.com": { source: "Merrill", initials: "ML" },
  "www.ubs.com": { source: "UBS", initials: "UB" },
  "www.lpl.com": { source: "LPL", initials: "LP" },
  "www.raymondjames.com": { source: "Raymond James", initials: "RJ" },
  "www.barrons.com": { source: "Barron's", initials: "BA" },
  "www.forbes.com": { source: "Forbes", initials: "FB" },
};

/**
 * Article shape consumed by {@link articleSource}. Only the `url` field
 * is read; the helper tolerates additional fields on the input object.
 */
export interface ArticleSourceInput {
  readonly url?: string | null;
}

/** Display attribution for an article in the feed. */
export interface ArticleSource {
  readonly source: string;
  readonly initials: string;
  readonly ctaLabel: string;
  readonly publicOriginalLink: boolean;
}

/**
 * Resolves the display attribution for an article based on its URL.
 * Falls back to the URL hostname (with the leading `www.` stripped)
 * when we don't recognise the host. Pure helper — never throws on bad
 * input.
 * @param article - Article payload used for URL construction.
 * @returns Source label, source initials, and outbound CTA label.
 */
export function articleSource(
  article: ArticleSourceInput | null | undefined
): ArticleSource {
  const url = article && article.url;
  if (!url)
    return {
      source: "External",
      initials: "?",
      ctaLabel: "Read original →",
      publicOriginalLink: false,
    };
  if (isLinkedInProfileUrl(url)) {
    return {
      source: "LinkedIn snippet",
      initials: "LS",
      ctaLabel: "Snippet-derived context",
      publicOriginalLink: false,
    };
  }
  const host = hostnameForUrl(url);
  const known = PUBLISHER_BY_HOST[host];
  const source = known
    ? known.source
    : (host.replace(/^www\./, "").split(".")[0] || "External").replace(
        /^\w/,
        c => c.toUpperCase()
      );
  const initialsText = known ? known.initials : initials(source);
  return {
    source,
    initials: initialsText,
    ctaLabel: `Read original on ${source} →`,
    publicOriginalLink: true,
  };
}

/**
 * Safely extracts a lowercase hostname from an article URL.
 * @param url - Article URL.
 * @returns Lowercase hostname or an empty string for invalid URLs.
 */
function hostnameForUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Identifies LinkedIn profile URLs that come from search-result snippets, not
 * public source articles.
 * @param url - Article URL to classify.
 * @returns True for LinkedIn profile URLs.
 */
function isLinkedInProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.toLowerCase().replace(/^www\./, "") === "linkedin.com" &&
      parsed.pathname.toLowerCase().startsWith("/in/")
    );
  } catch {
    return false;
  }
}

/**
 * Convenience bag of formatters threaded through to organisms
 * (FeedPostCard, TransitionEventCard, …) without rewiring imports.
 */
export const fmts = {
  fmtMoney,
  fmtPct,
  fmtDate,
  humanize,
  isPlaceholderValue,
  articleSource,
} as const;
