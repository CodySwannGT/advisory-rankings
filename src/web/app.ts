// AdvisorBook — shared utilities for every page in the web/ UI.
//
// This module is the boundary between page scripts and the
// platform / network layer:
//
//   • REST client (api / postJson)
//   • auth state (refreshMe / logout / getCurrentUser)
//   • URL helpers (getQueryParam)
//   • mountPage()  — convenience that delegates to the
//     design-system three-column template (kept for back-compat).
//
// Display formatters (fmtMoney / fmtPct / fmtDate / humanize / initials /
// isPlaceholderValue / articleSource / fmts) live in `app-formatters.ts`
// and are re-exported below so existing imports from `./app.js` keep
// working unchanged.
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
import {
  entityPath,
  articlePath,
  type ArticleLike,
  type EntityLike,
} from "./urls.js";
import { fmtDate, articleSource, fmts } from "./app-formatters.js";

// ─── tiny DOM helpers (re-exported for back-compat) ───────────
export { $, el, clear } from "./design-system/dom.js";

// ─── formatter re-exports (kept for back-compat) ──────────────
export {
  fmtMoney,
  fmtPct,
  fmtDate,
  humanize,
  initials,
  isPlaceholderValue,
  articleSource,
  fmts,
} from "./app-formatters.js";
export type {
  FmtMoneyOptions,
  FmtDateMode,
  FmtDateOptions,
  FmtDateInput,
  ArticleSourceInput,
  ArticleSource,
} from "./app-formatters.js";

// ─── REST client ──────────────────────────────────────────────
// Same-origin fetches send the Harper session cookie automatically
// when the user is logged in, and nothing at all when they aren't.
// Anonymous and authenticated paths share the same call sites.

/**
 * Fetch options accepted by {@link api}. Mirrors the subset of
 * `RequestInit` that callers actually use, while keeping `headers` as the
 * common record-of-strings shape so we can merge a default `Accept`
 * header without fighting `HeadersInit`'s union.
 */
export type ApiInit = Readonly<Omit<RequestInit, "headers">> &
  Readonly<Partial<Record<"headers", Readonly<Record<string, string>>>>>;

/**
 * JSON-shaped body accepted by {@link postJson}. Restricted to plain
 * objects so call sites cannot accidentally pass `FormData`/`Blob`/etc.
 * (which would be silently stringified to `"[object Object]"`).
 */
export type JsonBody = Readonly<Record<string, unknown>>;

/**
 * Performs a same-origin JSON fetch and surfaces non-2xx responses as
 * thrown {@link Error}s carrying the method, path, status, and the first
 * 200 chars of the response body for diagnostics.
 * @param path - Same-origin request path.
 * @param init - Fetch options merged with the default `Accept` header.
 * @returns Parsed JSON body, or `null` for 204 responses.
 */
export async function api(path: string, init: ApiInit = {}): Promise<unknown> {
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
 * Sends a POST with a JSON body via {@link api}.
 * @param path - Same-origin request path.
 * @param body - JSON-encodable request body.
 * @returns Parsed response body.
 */
export function postJson(path: string, body?: JsonBody): Promise<unknown> {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

// ─── auth state (shared module singleton) ─────────────────────

/**
 * Shape of the `/Me` envelope. Fields are intentionally loose because the
 * REST layer adds optional flags (`authUnavailable`, `message`) for the
 * client-only fallback path and may include additional user fields.
 */
export interface MeEnvelope {
  readonly authenticated?: boolean;
  readonly authUnavailable?: boolean;
  readonly message?: string;
  readonly [key: string]: unknown;
}

// Module-singleton state for the cached `/Me` envelope and the
// in-flight load. Held inside a single const-bound holder; the two
// slots are updated via `Object.assign`, which the project's
// `functional/immutable-data` rule permits (direct field assignment
// would not). See refreshMe/logout below.
const meState: Readonly<
  Record<"cache", MeEnvelope | null> &
    Record<"promise", Promise<MeEnvelope> | null>
> = { cache: null, promise: null };

/**
 * Returns the cached `/Me` envelope without triggering a network call.
 * @returns Cached session envelope, or null before the first refresh.
 */
export function getCurrentUser(): MeEnvelope | null {
  return meState.cache;
}

/**
 * Loads `/Me` (de-duplicating concurrent calls), caches the result, and
 * returns a recoverable envelope when the request fails.
 * @returns Authenticated user envelope, or an `authUnavailable` fallback.
 */
export async function refreshMe(): Promise<MeEnvelope> {
  if (!meState.promise) {
    Object.assign(meState, {
      promise: api("/Me")
        .catch(
          (error: unknown): MeEnvelope => ({
            authenticated: false,
            authUnavailable: true,
            message: sessionFallbackMessage(error),
          })
        )
        .then((m: unknown): MeEnvelope => {
          const envelope = (m ?? { authenticated: false }) as MeEnvelope;
          Object.assign(meState, { cache: envelope, promise: null });
          return envelope;
        }),
    });
  }
  return meState.promise as Promise<MeEnvelope>;
}

/**
 * Returns safe session recovery copy without exposing auth internals.
 * @param error - Failed `/Me` request.
 * @returns Public-facing fallback message.
 */
function sessionFallbackMessage(error: unknown): string {
  return isAuthFailure(error)
    ? "We couldn't confirm your session. Sign in again or continue browsing public pages."
    : "Session status is temporarily unavailable. Public pages remain available.";
}

/**
 * Detects auth/permission responses from the shared REST error format.
 * @param error - Error thrown by api().
 * @returns Whether this was an auth or permission failure.
 */
export function isAuthFailure(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return /\b(401|403)\b/.test(message);
}

// ─── global search ────────────────────────────────────────────
// Wraps `/Search?q=…` so the navbar's `GlobalSearch` organism can
// stay decoupled from the REST layer. Returns the raw envelope:
//   { q, items: [{ kind, id, name, sub, score }], counts }

/**
 * Result envelope returned by {@link search}. The REST layer hands back
 * the same shape it receives from Harper, so the typing mirrors the
 * documented envelope without locking down `items` past what the navbar
 * organism consumes.
 */
export interface SearchEnvelope {
  readonly q: string;
  readonly items: readonly SearchItem[];
  readonly counts: SearchCounts;
}

/**
 * Counts grouped by entity kind, plus a `total` rollup the navbar uses
 * to render the result-count badge.
 */
export interface SearchCounts {
  readonly firms: number;
  readonly advisors: number;
  readonly teams: number;
  readonly total: number;
}

/**
 * Search hit shape. `kind` is one of the three public entity kinds plus
 * `article` for cross-content matches; keep extra fields permissive so
 * future score/snippet additions don't break callers.
 */
export interface SearchItem {
  readonly kind: "firm" | "advisor" | "team" | "article" | string;
  readonly id: string;
  readonly name?: string;
  readonly sub?: string;
  readonly score?: number;
  readonly [key: string]: unknown;
}

/**
 * Searches firms, advisors, and teams via the `/Search` endpoint.
 * Short-circuits when the query is fewer than two characters so the
 * navbar doesn't issue chatty single-character requests.
 * @param q - Raw user-entered search string.
 * @returns Matching firms, advisors, and teams.
 */
export async function search(q: string): Promise<SearchEnvelope> {
  const norm = String(q || "").trim();
  if (norm.length < 2)
    return {
      q: norm,
      items: [],
      counts: { firms: 0, advisors: 0, teams: 0, total: 0 },
    };
  return (await api(`/Search?q=${encodeURIComponent(norm)}`)) as SearchEnvelope;
}

/**
 * Signs the current user out of Harper and navigates to a freshly
 * rendered home page. Swallows logout failures so the UI still clears
 * even if the server session is already gone.
 */
export async function logout(): Promise<void> {
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

/**
 * Reads a single query-string parameter from the current location.
 * @param name - Query-string parameter name.
 * @returns The query parameter value, or null when absent.
 */
export function getQueryParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

export {
  slugifyText,
  entityPath,
  articlePath,
  entityIdFromLocation as getEntityIdParam,
  articleIdFromLocation as getArticleIdParam,
} from "./urls.js";

/** Entity kinds accepted by {@link canonicalizeEntityRoute}. */
export type CanonicalEntityKind = "firm" | "advisor" | "team";

/**
 * Rewrites the current URL to the canonical slug for an entity profile.
 * @param kind - Entity kind.
 * @param entity - Entity payload used for URL construction.
 */
export function canonicalizeEntityRoute(
  kind: CanonicalEntityKind,
  entity: EntityLike | null | undefined
): void {
  const path = entityPath(kind, entity);
  replaceWithCanonicalPath(path);
}

/**
 * Rewrites the current URL to the canonical slug for an article.
 * @param article - Article payload used for URL construction.
 */
export function canonicalizeArticleRoute(
  article: ArticleLike | null | undefined
): void {
  const path = articlePath(article);
  replaceWithCanonicalPath(path);
}

/**
 * Replaces the current history entry with a canonical path when one is
 * available, preserving query strings the route may rely on.
 * @param path - Canonical browser path.
 */
function replaceWithCanonicalPath(path: string): void {
  if (!path || path === "#" || !globalThis.history?.replaceState) return;
  if (location.pathname === path && !location.search) return;
  history.replaceState(null, "", path);
}

// ─── mountPage — convenience shim around the template ─────────
//
// Existing pages call `mountPage({ active, build(layout) {...} })`
// and assume `layout` is the .layout grid root. The three-column
// template now exposes `{ left, center, right, layout }`; we pass
// `layout` to legacy callers but new code should adopt the
// destructured form via `mountThreeColumnPage` directly.

/**
 * Layout slots handed back by {@link mountThreeColumnPage} that
 * {@link mountPage} forwards to legacy `build(layout)` callers.
 */
export interface MountPageLayout {
  readonly left: HTMLElement;
  readonly center: HTMLElement;
  readonly right: HTMLElement;
  readonly layout: HTMLElement;
}

/** Options accepted by {@link mountPage}. */
export interface MountPageOptions {
  readonly active?: string;
  readonly pageTitle?: string;
  readonly build: (layout: HTMLElement) => void;
}

/**
 * Back-compat shim that mounts the three-column template and hands the
 * legacy `build(layout)` callers the grid root (rather than the new
 * `{ left, center, right }` destructured form).
 * @param options - Page mount options.
 * @param options.active - Active route name for navbar highlighting.
 * @param options.pageTitle - Route-level h1 announced to assistive tech.
 * @param options.build - Legacy builder that receives the grid root.
 */
export function mountPage({
  active,
  pageTitle,
  build,
}: MountPageOptions): void {
  mountThreeColumnPage({
    active,
    refreshMe,
    logout,
    search,
    pageTitle,
    build: ({ layout }: MountPageLayout) => build(layout),
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
 * Narrow callable type for design-system organisms that still opt out of
 * TypeScript checking. Mirrors the adapter pattern in
 * `src/web/detail-state.ts` so each module needs exactly one `as`
 * boundary against the untyped design-system surface.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

/**
 * Single adapter that retypes the four organism re-exports used by the
 * legacy lower-case wrappers below. Centralising the cast keeps app.ts
 * to one `as` boundary against the still-untyped design-system surface
 * (the same pattern `detail-state.ts` uses).
 */
const legacyOrganisms = {
  SectionCard: _SectionCard,
  ArticleListBlock: _ArticleListBlock,
  TransitionEventCard: _TransitionEventCard,
  DisclosureEventCard: _DisclosureEventCard,
} as unknown as Readonly<
  Record<
    | "SectionCard"
    | "ArticleListBlock"
    | "TransitionEventCard"
    | "DisclosureEventCard",
    DesignSystemComponent
  >
>;

/**
 * Legacy lower-case wrapper around the SectionCard organism.
 * @param title - Card heading text.
 * @param body - Card body content (DOM node or string).
 * @returns Section card element.
 */
export function sectionCard(title: unknown, body: unknown): HTMLElement {
  return legacyOrganisms.SectionCard({ title, body });
}

/**
 * Legacy lower-case wrapper around the ArticleListBlock organism.
 * @param articles - Article rows.
 * @returns Article list block element.
 */
export function articleListBlock(articles: unknown): HTMLElement {
  return legacyOrganisms.ArticleListBlock({
    articles,
    fmtDate,
    articleSource,
  });
}

/**
 * Legacy lower-case wrapper around the TransitionEventCard organism.
 * @param t - Transition event row.
 * @returns Transition event card element.
 */
export function transitionRow(t: unknown): HTMLElement {
  return legacyOrganisms.TransitionEventCard(t, fmts);
}

/**
 * Legacy lower-case wrapper around the DisclosureEventCard organism.
 * @param d - Disclosure event payload.
 * @returns Disclosure event card node.
 */
export function disclosureRow(d: unknown): HTMLElement {
  return legacyOrganisms.DisclosureEventCard(d, fmts);
}
