/**
 * Content negotiation for the legacy detail data-routes.
 *
 * The custom Harper resources `AdvisorProfile`, `FirmProfile`, `TeamProfile`,
 * and `ArticleView` are REST endpoints that return JSON. When a browser
 * follows a stale/shared link straight to one of those resource paths
 * (e.g. `/AdvisorProfile/<id>`), Harper's REST content negotiation matches
 * the wildcard token (star/star) every browser sends in its `Accept` header and serves the
 * JSON payload as the document body — including the `{"error":"not found"}`
 * envelope for invalid ids. The user sees raw JSON instead of AdvisorBook's
 * in-app not-found experience.
 *
 * The clean public URLs (`/advisors/<slug>-<id>`, etc.) already serve the
 * matching HTML shell via `seo_shell.js`, which boots the SPA and renders the
 * route-level not-found card client-side. This module lets the legacy detail
 * paths behave the same way: serve the HTML shell for browser *document*
 * navigations while preserving the JSON payload for the SPA's own
 * `fetch`/XHR calls (which always send `Accept: application/json`).
 *
 * The exported helpers are kept side-effect-light so they can be unit-tested
 * without a running Harper server. They are consumed by the deployed Harper
 * detail resources (`src/harper/resource-profile-endpoints.ts`, which return
 * the shell via Harper's `{ contentType, data }` response contract) and by the
 * local dev server (`src/scripts/dev_server_routes.ts`).
 */

/** Legacy detail resource name → static HTML shell that boots its SPA page. */
const LEGACY_DETAIL_SHELLS: Readonly<Record<string, string>> = {
  AdvisorProfile: "advisor.html",
  FirmProfile: "firm.html",
  TeamProfile: "team.html",
  ArticleView: "article.html",
};

/** Matches `/Resource/<id>` for exactly the four legacy detail resources. */
const LEGACY_DETAIL_PATH_RE =
  /^\/(AdvisorProfile|FirmProfile|TeamProfile|ArticleView)\/[^/]+\/?$/;

/** Minimal request-header view the negotiation needs (case-insensitive). */
export type DetailRequestHeaders = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/**
 * Resolves the HTML shell that should serve a legacy detail-route request.
 *
 * @param url - Request URL or pathname (query string is ignored).
 * @returns The shell file name (e.g. `advisor.html`) when the path targets a
 *   legacy detail resource with an id segment, otherwise `null`.
 */
export function matchLegacyDetailShell(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const pathname = url.split(/[?#]/)[0];
  const match = LEGACY_DETAIL_PATH_RE.exec(pathname);
  if (!match) return null;
  return LEGACY_DETAIL_SHELLS[match[1]] ?? null;
}

/**
 * Reads a header value case-insensitively from a header bag.
 * @param headers - Incoming request headers.
 * @param name - Lowercase header name to read.
 * @returns The header value as a string, or an empty string when absent.
 */
function header(headers: DetailRequestHeaders, name: string): string {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    return Array.isArray(value) ? value.join(",") : String(value ?? "");
  }
  return "";
}

/**
 * Decides whether a request is a browser document navigation that should
 * receive the HTML app shell rather than the raw JSON resource payload.
 *
 * The discriminator is **Accept-driven**, which is the only signal that
 * survives the Fabric edge proxy intact: a top-level browser navigation sends
 * `Accept: text/html,…,*\/*` while the SPA's own `api()` data fetch sends
 * `Accept: application/json`. (Fetch-Metadata headers like `Sec-Fetch-Dest`
 * are *not* relied on — the edge layer rewrites them, so a real navigation can
 * arrive as `sec-fetch-dest: empty`.) A `Sec-Fetch-Dest: document` hint and an
 * explicit HTML Accept are honoured as positive triggers; an `X-Requested-With`
 * marker or a JSON-only Accept positively excludes the shell. Generic clients
 * that send only `*\/*` keep their JSON, so non-browser API access is unchanged.
 *
 * @param headers - Incoming request headers (case-insensitive).
 * @returns `true` when the HTML shell should be served, otherwise `false`.
 */
export function prefersHtmlDocument(headers: DetailRequestHeaders): boolean {
  const accept = header(headers, "accept");
  const dest = header(headers, "sec-fetch-dest").toLowerCase();
  const requestedWith = header(headers, "x-requested-with");

  // An explicit XHR marker is a positive data-request signal.
  if (requestedWith) return false;

  const acceptsHtml = /text\/html/i.test(accept);
  const acceptsJsonOnly = /application\/json/i.test(accept) && !acceptsHtml;
  // The SPA's api() sends Accept: application/json — never give it the shell.
  if (acceptsJsonOnly) return false;

  // A top-level navigation is identified by an HTML Accept or, when present and
  // trustworthy, a document Fetch-Metadata destination.
  return acceptsHtml || dest === "document";
}

/** Harper REST response that serves a raw body with an explicit content type. */
export interface ContentResponse {
  readonly contentType: string;
  readonly data: string;
}

/**
 * Resolves the HTML shell that boots a given legacy detail resource's page.
 * @param resourceName - Resource class name (e.g. `AdvisorProfile`).
 * @returns The shell file name, or `null` when the resource has no shell.
 */
export function shellFileForResource(resourceName: string): string | null {
  return LEGACY_DETAIL_SHELLS[resourceName] ?? null;
}

/**
 * Extracts a case-insensitive request-header bag from a Harper resource
 * context. Harper exposes request headers in a few shapes depending on the
 * transport: a `Headers`-like object with `.asObject`/`.get`, a plain record,
 * or nested under `requestContext` for cache/source contexts. This normalises
 * all of them to the small subset the negotiation reads.
 *
 * @param context - Value returned by `Resource.prototype.getContext()`.
 * @returns A header bag suitable for {@link prefersHtmlDocument}.
 */
export function requestHeadersFromContext(
  context: unknown
): DetailRequestHeaders {
  if (!context || typeof context !== "object") return {};
  const ctx = context as Readonly<Record<string, unknown>>;
  const raw =
    (ctx["headers"] as unknown) ??
    ((ctx["requestContext"] as Readonly<Record<string, unknown>> | undefined)?.[
      "headers"
    ] as unknown);
  if (!raw || typeof raw !== "object") return {};

  const bag = raw as Readonly<Record<string, unknown>>;
  const asObject = bag["asObject"];
  if (asObject && typeof asObject === "object") {
    return asObject as DetailRequestHeaders;
  }
  const getter = bag["get"];
  if (typeof getter === "function") {
    const read = (name: string): string =>
      String((getter as (n: string) => unknown).call(bag, name) ?? "");
    return {
      accept: read("accept"),
      "sec-fetch-dest": read("sec-fetch-dest"),
      "sec-fetch-mode": read("sec-fetch-mode"),
      "x-requested-with": read("x-requested-with"),
    };
  }
  return bag as DetailRequestHeaders;
}

/**
 * Decides whether a legacy detail resource should serve the HTML app shell for
 * the current request, and if so builds the Harper `{ contentType, data }`
 * response by loading the matching shell through the injected reader.
 *
 * Returns `null` when the request is not a browser document navigation, so the
 * caller falls back to its normal JSON payload.
 *
 * @param context - The resource's `getContext()` value (carries request headers).
 * @param resourceName - The resource class name (e.g. `AdvisorProfile`).
 * @param readShell - Loads a shell file's HTML by file name.
 * @returns A content response that serves the shell, or `null`.
 */
export async function detailShellResponse(
  context: unknown,
  resourceName: string,
  readShell: (shellFile: string) => Promise<string>
): Promise<ContentResponse | null> {
  const shellFile = shellFileForResource(resourceName);
  if (!shellFile) return null;
  if (!prefersHtmlDocument(requestHeadersFromContext(context))) return null;
  const data = await readShell(shellFile);
  return { contentType: "text/html; charset=utf-8", data };
}
