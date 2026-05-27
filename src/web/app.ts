// @ts-nocheck
// AdvisorBook — shared utilities for every page in the web/ UI.
//
// This module is the boundary between page scripts and the
// platform / network layer:
//
//   • REST client (api / postJson)
//   • auth state (refreshMe / logout / getCurrentUser)
//   • formatting helpers (fmtMoney / fmtPct / fmtDate / initials)
//   • URL helpers (getQueryParam)
//   • mountPage()  — convenience that delegates to the
//     design-system three-column template (kept for back-compat).
//
// All UI components live in ./design-system/. New page code should
// import them from there directly:
//
//   import { SectionCard, EntityRow, FeedPostCard } from './design-system/index.js';
//
// We talk to Harper via the same origin we're served from (the
// static component and REST resources both bind to port 9926 by
// default), so all calls are relative.

import { mountThreeColumnPage } from "./design-system/templates.js";
import { entityPath, articlePath } from "./urls.js";

// ─── tiny DOM helpers (re-exported for back-compat) ───────────
export { $, el, clear } from "./design-system/dom.js";

// ─── REST client ──────────────────────────────────────────────
// Same-origin fetches send the Harper session cookie automatically
// when the user is logged in, and nothing at all when they aren't.
// Anonymous and authenticated paths share the same call sites.

/**
 * Handles api for this workflow.
 * @param path - Request path or filesystem path.
 * @param init - Fetch options.
 * @returns The computed value.
 */
export async function api(path, init = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...init.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${init.method || "GET"} ${path} → ${res.status} ${text.slice(0, 200)}`
    );
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Handles post json for this workflow.
 * @param path - Request path or filesystem path.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
export function postJson(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

// ─── auth state (shared module singleton) ─────────────────────

const meState = { cache: null, promise: null };
/**
 * Gets current user for downstream processing.
 * @returns The loaded result.
 */
export function getCurrentUser() {
  return meState.cache;
}
/**
 * Handles refresh me for this workflow.
 * @returns The computed value.
 */
export async function refreshMe() {
  if (!meState.promise) {
    Object.assign(meState, {
      promise: api("/Me")
        .catch(error => ({
          authenticated: false,
          authUnavailable: true,
          message: sessionFallbackMessage(error),
        }))
        .then(m => {
          Object.assign(meState, { cache: m, promise: null });
          return m;
        }),
    });
  }
  return meState.promise;
}

/**
 * Returns safe session recovery copy without exposing auth internals.
 * @param error - Failed `/Me` request.
 * @returns Public-facing fallback message.
 */
function sessionFallbackMessage(error) {
  return isAuthFailure(error)
    ? "We couldn't confirm your session. Sign in again or continue browsing public pages."
    : "Session status is temporarily unavailable. Public pages remain available.";
}

/**
 * Detects auth/permission responses from the shared REST error format.
 * @param error - Error thrown by api().
 * @returns Whether this was an auth or permission failure.
 */
export function isAuthFailure(error) {
  return /\b(401|403)\b/.test(String(error?.message || error));
}
// ─── global search ────────────────────────────────────────────
/**
 * Searches public entities for the navbar.
 * @param q - Query text.
 * @param kind - Optional entity kind filter.
 * @returns Matching firms, advisors, and teams.
 */
export async function search(q, kind = "all") {
  const norm = String(q || "").trim();
  if (norm.length < 2)
    // prettier-ignore
    return { q: norm, counts: { firms: 0, advisors: 0, teams: 0, total: 0 }, items: [] };
  const kindParam = ["advisor", "firm", "team"].includes(kind)
    ? `&kind=${encodeURIComponent(kind)}`
    : "";
  return api(`/Search?q=${encodeURIComponent(norm)}${kindParam}`);
}

/**
 * Handles logout for this workflow.
 * @returns The computed value.
 */
export async function logout() {
  try {
    await postJson("/Logout");
  } catch (_error) {
    // The local UI should still clear when the server session is already gone.
  }
  Object.assign(meState, { cache: { authenticated: false } });
  // Use replace+reload so we end up on a freshly-rendered home
  // (otherwise setting href to the current page is a no-op).
  if (location.pathname.endsWith("/index.html") || location.pathname === "/") {
    location.reload();
  } else {
    location.href = "/";
  }
}

// ─── formatting ───────────────────────────────────────────────

/**
 * Handles fmt money for this workflow.
 * @param n - n used by this operation.
 * @param root0 - value used by this operation.
 * @param root0.compact - compact used by this operation.
 * @returns The computed value.
 */
export function fmtMoney(n, { compact = true } = {}) {
  if (n == null) return "—";
  if (compact) {
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  }
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Handles fmt pct for this workflow.
 * @param p - p used by this operation.
 * @returns The computed value.
 */
export function fmtPct(p) {
  if (p == null) return "—";
  return `${(p * 100).toFixed(0)}%`;
}

/**
 * Handles fmt date for this workflow.
 * @param d - d used by this operation.
 * @param root0 - value used by this operation.
 * @param root0.mode - mode used by this operation.
 * @returns The computed value.
 */
export function fmtDate(d, { mode = "long" } = {}) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  if (mode === "short") return shortDate(dt);
  if (mode === "rel") return relativeDate(dt);
  return longDate(dt);
}

/**
 * Formats a compact UTC month/year label.
 * @param date - Valid Date object.
 * @returns Short date label.
 */
function shortDate(date) {
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
function relativeDate(date) {
  const diffMs = new Date() - date;
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
function longDate(date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const PLACEHOLDER_VALUES = new Set([
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);
const ACRONYM_LABELS = new Map([
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
 * Checks whether the value is placeholder value.
 * @param value - Raw value to normalize or parse.
 * @returns True when the condition is met.
 */
export function isPlaceholderValue(value) {
  return (
    value == null || PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase())
  );
}

// Convert a snake_case / camelCase / PascalCase identifier into
// a sentence-cased, space-separated label. All-uppercase tokens
// (FINRA, SEC, LLC, …) and already-spaced strings pass through
// unchanged so we don't mangle acronyms.
/**
 * Handles humanize for this workflow.
 * @param s - s used by this operation.
 * @returns The computed value.
 */
export function humanize(s) {
  if (s == null) return s;
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
 * Handles initials for this workflow.
 * @param name - Display name or option name.
 * @returns The computed value.
 */
export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Gets query param for downstream processing.
 * @param name - Display name or option name.
 * @returns The query parameter value, or null when absent.
 */
export function getQueryParam(name) {
  return new URLSearchParams(location.search).get(name);
}

export {
  slugifyText,
  entityPath,
  articlePath,
  entityIdFromLocation as getEntityIdParam,
  articleIdFromLocation as getArticleIdParam,
} from "./urls.js";

/**
 * Handles canonicalize entity route for this workflow.
 * @param kind - Entity kind.
 * @param entity - Entity payload used for URL construction.
 */
export function canonicalizeEntityRoute(kind, entity) {
  const path = entityPath(kind, entity);
  replaceWithCanonicalPath(path);
}

/**
 * Handles canonicalize article route for this workflow.
 * @param article - Article payload used for URL construction.
 */
export function canonicalizeArticleRoute(article) {
  const path = articlePath(article);
  replaceWithCanonicalPath(path);
}

/**
 * Handles replace with canonical path for this workflow.
 * @param path - Request path or filesystem path.
 * @returns The computed value.
 */
function replaceWithCanonicalPath(path) {
  if (!path || path === "#" || !globalThis.history?.replaceState) return;
  if (location.pathname === path && !location.search) return;
  history.replaceState(null, "", path);
}

// Map an article URL hostname to the publisher we want to attribute
// the post to in the UI. Most articles in this DB are AdvisorHub posts;
// firm-bio articles (Morgan Stanley, Wells Fargo, Edward Jones, …) are
// minted by the upsert-advisor skill against the firm's public
// advisor-locator and need a different label + initials.
const PUBLISHER_BY_HOST = {
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

// Returns { source, initials, ctaLabel } for an article. Falls back to
// the URL hostname (with the leading "www." stripped) when we don't
// recognise the host. Pure helper — never throws on bad input.
/**
 * Handles article source for this workflow.
 * @param article - Article payload used for URL construction.
 * @returns Source label, source initials, and outbound CTA label.
 */
export function articleSource(article) {
  const url = article && article.url;
  if (!url)
    return { source: "External", initials: "?", ctaLabel: "Read original →" };
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
  };
}

/**
 * Safely extracts a lowercase hostname from an article URL.
 * @param url - Article URL.
 * @returns Lowercase hostname or an empty string for invalid URLs.
 */
function hostnameForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Convenience bag of formatters to thread through to organisms
// (FeedPostCard, TransitionEventCard, …) without rewiring imports.
export const fmts = {
  fmtMoney,
  fmtPct,
  fmtDate,
  humanize,
  isPlaceholderValue,
  articleSource,
};

// ─── mountPage — convenience shim around the template ─────────
//
// Existing pages call `mountPage({ active, build(layout) {...} })`
// and assume `layout` is the .layout grid root. The three-column
// template now exposes `{ left, center, right, layout }`; we pass
// `layout` to legacy callers but new code should adopt the
// destructured form via `mountThreeColumnPage` directly.
/**
 * Handles mount page for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.active - active used by this operation.
 * @param root0.pageTitle - page title exposed as the route-level h1.
 * @param root0.build - build used by this operation.
 * @returns The computed value.
 */
export function mountPage({ active, pageTitle, build }) {
  mountThreeColumnPage({
    active,
    refreshMe,
    logout,
    search,
    pageTitle,
    build: ({ layout }) => build(layout),
  });
}

// ─── Back-compat re-exports — UI components moved to design-system.
// New page code should import these from ./design-system/index.js.
export {
  EntityChip as entityChip,
  PostHeader,
  EntityRow,
  KvList,
} from "./design-system/molecules.js";

export {
  SectionCard,
  ProfileHead as profileHead,
  EmptyCard,
  ArticleListBlock,
  FeedPostCard,
  TransitionEventCard,
  DisclosureEventCard,
  Navbar as navbar,
  SiteFooter as siteFooter,
} from "./design-system/organisms.js";

// Legacy lower-case wrappers used by existing pages.
import {
  SectionCard as _SectionCard,
  ArticleListBlock as _ArticleListBlock,
  TransitionEventCard as _TransitionEventCard,
  DisclosureEventCard as _DisclosureEventCard,
} from "./design-system/organisms.js";

/**
 * Handles section card for this workflow.
 * @param title - title used by this operation.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
export function sectionCard(title, body) {
  return _SectionCard({ title, body });
}
/**
 * Handles article list block for this workflow.
 * @param articles - articles used by this operation.
 * @returns The computed value.
 */
export function articleListBlock(articles) {
  return _ArticleListBlock({ articles, fmtDate, articleSource });
}
/**
 * Handles transition row for this workflow.
 * @param t - Team row.
 * @returns The computed value.
 */
export function transitionRow(t) {
  return _TransitionEventCard(t, fmts);
}
/**
 * Renders a disclosure event with shared app formatters.
 * @param d - Disclosure event payload.
 * @returns Disclosure event card node.
 */
export function disclosureRow(d) {
  return _DisclosureEventCard(d, fmts);
}
