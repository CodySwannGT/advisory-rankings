#!/usr/bin/env node
/**
 * Local dev server for the web/ UI.
 *
 * Why this exists: this sandbox kernel can't bind Harper's REST TCP
 * port (see docs/fabric-runbook.md §5/§8 for the SO_REUSEPORT
 * background), so http://127.0.0.1:9926/ — where Harper would
 * normally serve both the static web/ and the JS resources — is
 * unreachable.  This server reproduces that surface in plain Node:
 *   - Static GET for /             → web/index.html
 *   - Static GET for /<file>       → web/<file>
 *   - Static GET for /firms        → web/firms.html
 *   - Static GET for /recruiting   → web/recruiting.html
 *   - Static GET for /rankings     → web/rankings.html
 *   - Static GET for /regulatory   → web/regulatory.html
 *   - Static GET for /firms/<slug> → web/firm.html
 *   - Static GET for /articles/<slug> → web/article.html
 *   - GET /Feed                    → resources.js Feed.get()
 *   - GET /ArticleView/<id>        → resources.js ArticleView.get(id)
 *   - GET /FirmProfile/<id>        → resources.js FirmProfile.get(id)
 *   - GET /AdvisorProfile/<id>     → resources.js AdvisorProfile.get(id)
 *   - GET /TeamProfile/<id>        → resources.js TeamProfile.get(id)
 *   - GET /Search?q=…              → resources.js Search.get()
 *   - GET /RecruitingMarket        → resources.js RecruitingMarket.get()
 *   - GET /RankingsExplorer        → resources.js RankingsExplorer.get()
 *   - POST /mcp                    → resources.js mcp.post(body)
 *   - GET /<TableName>/            → operations-API SQL passthrough
 *
 * Backend store is the running local Harper, accessed exclusively
 * over its operations-server Unix socket — the same socket
 * `bun run seed`, `bun run verify`, and `bun run preview` already use.
 *
 * Usage:
 *   bun run dev:server                             # listens on :9926
 *   PORT=8080 bun run dev:server                   # listens on :8080
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { handleAuthRoute } from "./dev_server_auth.js";
import {
  DEV_SERVER_HOST,
  DEV_SERVER_PORT,
  DEV_SERVER_SOCKET,
  DEV_URL_BASE,
} from "./dev_server_constants.js";
import { sendJson } from "./dev_server_json.js";
import { clearResourcesCache } from "./dev_server_resources.js";
import {
  handleMcpRoute,
  handleResourceRoute,
  handleTableRoute,
} from "./dev_server_routes.js";
import { DEV_SERVER_WEB_ROOT, serveStatic } from "./dev_server_static.js";

/**
 * Extracts a printable error message without depending on `err` being typed
 * as `Error` — handlers can throw anything, so we narrow defensively.
 *
 * @param err - Thrown value of unknown shape.
 * @returns Best-effort message string.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}

/**
 * Dispatches to the first matching dev-server route.
 *
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 */
async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  if (await handleAuthRoute(req, res, url.pathname)) return;
  if (await handleMcpRoute(req, res, url.pathname)) return;
  if (await handleResourceRoute(res, url)) return;
  if (await handleTableRoute(res, url.pathname)) return;
  await serveStatic(req, res);
}

/**
 * Routes one HTTP request through auth, resource, table, or static handlers.
 *
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 */
async function handle(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", DEV_URL_BASE);
  try {
    await routeRequest(req, res, url);
  } catch (err) {
    console.error("500", url.pathname, errorMessage(err));
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Clears the resources import cache before each request when `HOT=1`.
 *
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 */
function devMode(req: IncomingMessage, res: ServerResponse): void {
  clearResourcesCache();
  void handle(req, res);
}

const requestHandler =
  process.env.HOT === "1"
    ? devMode
    : (req: IncomingMessage, res: ServerResponse) => {
        void handle(req, res);
      };

createServer(requestHandler).listen(DEV_SERVER_PORT, DEV_SERVER_HOST, () => {
  console.log(
    `dev server listening on http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`
  );
  console.log(`  static: ${DEV_SERVER_WEB_ROOT}`);
  console.log(`  ops socket: ${DEV_SERVER_SOCKET}`);
});
