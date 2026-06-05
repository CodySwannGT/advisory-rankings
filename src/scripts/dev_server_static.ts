/**
 * Static-asset handling for the local dev server.
 *
 * Mirrors the subset of `harper-app/web/` routing that the deployed Fabric
 * cluster fronts via its built-in static handler, so the UI can be
 * exercised offline against the same URL shapes the deploy uses.
 */

import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { DEV_URL_BASE } from "./dev_server_constants.js";

const ROOT = resolve("harper-app/web");

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const STATIC_EXACT_PATHS: ReadonlyMap<string, string> = new Map([
  ["/", "/index.html"],
  ["/firms", "/firms.html"],
  ["/recruiting", "/recruiting.html"],
  ["/rankings", "/rankings.html"],
  ["/regulatory", "/regulatory.html"],
  ["/regulatory/discrepancies", "/regulatory-discrepancies.html"],
  ["/compare", "/compare.html"],
  ["/advisors", "/advisors.html"],
  ["/teams", "/teams.html"],
  ["/watchlists", "/watchlists.html"],
]);

const STATIC_PREFIX_PATHS: readonly (readonly [string, string])[] = [
  ["/firms/", "/firm.html"],
  ["/advisors/", "/advisor.html"],
  ["/teams/", "/team.html"],
  ["/articles/", "/article.html"],
];

/**
 * Chooses cache headers for static assets served by the local dev server.
 * @param extension - Requested file extension (with leading dot).
 * @returns Cache-Control header value.
 */
function staticCacheControl(extension: string): string {
  return [".ico", ".svg", ".png", ".css", ".js"].includes(extension)
    ? "public, max-age=3600"
    : "no-store";
}

/**
 * Maps pretty routes to their generated static HTML files.
 * @param path - Request pathname.
 * @returns Static file path under `harper-app/web`.
 */
function staticPath(path: string): string {
  return (
    STATIC_EXACT_PATHS.get(path) ||
    STATIC_PREFIX_PATHS.find(([prefix]) => path.startsWith(prefix))?.[1] ||
    path
  );
}

/**
 * Serves a static file under `harper-app/web` for the given request.
 *
 * Returns 403 for traversal attempts that escape the web root, and 404
 * for any read or stat failure (intentionally opaque — we don't want the
 * dev server to leak filesystem layout).
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 */
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestUrl = req.url ?? "/";
  const rawPath = decodeURIComponent(
    new URL(requestUrl, DEV_URL_BASE).pathname
  );
  const mapped = staticPath(rawPath);
  const file = join(ROOT, mapped);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    const extension = extname(file);
    res.writeHead(200, {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Cache-Control": staticCacheControl(extension),
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

/** Public view of the configured web root, exposed for startup logging. */
export const DEV_SERVER_WEB_ROOT = ROOT;
