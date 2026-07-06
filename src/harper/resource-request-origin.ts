/**
 * Same-origin enforcement for cookie-authenticated write endpoints.
 *
 * Harper hardcodes the session cookie to `SameSite=None; Secure` on HTTPS
 * (see docs/fabric-runbook.md, Login/logout section), which removes the
 * browser's own CSRF layer. Because the app serves its UI and REST routes
 * from one origin, a state-changing request that arrives with a foreign
 * `Origin`/`Referer` can only be a cross-site request carrying the victim's
 * cookie — so it is rejected before the handler runs.
 *
 * Requests without an `Origin` AND without a `Referer` are allowed: browsers
 * always attach `Origin` to credentialed `fetch` POSTs, so a bare request is
 * a non-browser client (curl, smoke harness, MCP tooling) that cannot be
 * driven by a victim's ambient cookie.
 */

import { requestHeadersFromContext } from "./detail-shell-negotiation.js";
import { throwStatus } from "./resource-user-watchlists-store.js";

/**
 * Reads one header value case-insensitively from a normalized header bag.
 * @param headers Case-varied header record.
 * @param name Lowercase header name.
 * @returns Header value, or empty string when absent.
 */
function readHeader(
  headers: Readonly<Record<string, unknown>>,
  name: string
): string {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    return Array.isArray(value) ? value.join(",") : String(value ?? "");
  }
  return "";
}

/**
 * Extracts the lowercased host (including port) from an absolute URL.
 * @param url Absolute URL from an `Origin` or `Referer` header.
 * @returns The lowercased host, or null when the value does not parse.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Rejects cookie-bearing state-changing requests whose browser-attested
 * source origin differs from the host serving the app. The serving host is
 * matched against both `Host` and `X-Forwarded-Host` so the check stays
 * correct behind the Fabric edge proxy.
 * @param context The resource's `getContext()` value (carries request headers).
 * @throws 403 `StatusError` when the request is provably cross-origin.
 */
export function requireSameOrigin(context: unknown): void {
  const headers = requestHeadersFromContext(context) as Readonly<
    Record<string, unknown>
  >;
  const source =
    readHeader(headers, "origin") || readHeader(headers, "referer");
  if (!source) return;

  const hosts = [
    readHeader(headers, "host").toLowerCase(),
    readHeader(headers, "x-forwarded-host").toLowerCase(),
  ].filter(Boolean);
  if (hosts.length === 0) return;

  const sourceHost = hostOf(source);
  if (sourceHost && hosts.includes(sourceHost)) return;
  throwStatus("Cross-origin request rejected", 403);
}
