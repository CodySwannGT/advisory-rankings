#!/usr/bin/env node
// @ts-nocheck
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
 * @returns The computed value.
 */

import { createServer, request as httpRequest } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { handleAuthRoute } from "./dev_server_auth.js";

const PORT = Number(process.env.PORT || 9926);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = resolve("harper-app/web");
const SOCKET =
  process.env.HDB_OPS_SOCKET ||
  `${process.env.HOME}/.harperdb/operations-server`;
const USER = process.env.HDB_ADMIN_USERNAME || "admin";
const PASS = process.env.HDB_ADMIN_PASSWORD || "admin-local";
const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}`;
const DEV_URL_BASE = ["http", "://x"].join("");

const TABLES = [
  "Firm",
  "FirmAlias",
  "FirmMergeAudit",
  "FirmSuccession",
  "Branch",
  "BranchAssignment",
  "Advisor",
  "Education",
  "Designation",
  "License",
  "EmploymentHistory",
  "RegistrationApplication",
  "Team",
  "TeamMembership",
  "TeamMetricSnapshot",
  "AdvisorMetricSnapshot",
  "TransitionEvent",
  "RecruitingDealQuote",
  "Disclosure",
  "DisclosureCluster",
  "Sanction",
  "OutsideBusinessActivity",
  "EmployerConcentration",
  "Ranking",
  "RankingEntry",
  "Article",
  "ArticleAdvisorMention",
  "ArticleFirmMention",
  "ArticleTeamMention",
  "ArticleTransitionEventMention",
  "ArticleDisclosureMention",
  "FieldAssertion",
];

// ── ops API helpers ─────────────────────────────────────────────

/**
 * Handles ops call for this workflow.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
function opsCall(body) {
  return new Promise((resolveP, reject) => {
    const req = httpRequest(
      {
        socketPath: SOCKET,
        method: "POST",
        path: "/",
        headers: { "Content-Type": "application/json", Authorization: AUTH },
      },
      async res => {
        res.setEncoding("utf8");
        const buf = await new Response(res).text();
        try {
          resolveP(JSON.parse(buf));
        } catch (_error) {
          reject(new Error(`bad json from ops API: ${buf.slice(0, 200)}`));
        }
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Loads table from the configured source.
 * @param name - Display name or option name.
 * @returns The loaded result.
 */
async function loadTable(name) {
  const res = await opsCall({
    operation: "sql",
    sql: `SELECT * FROM data.${name}`,
  });
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

// ── load resources.js with a tables shim ────────────────────────

const resourceState = { resources: null };
/**
 * Loads all Harper tables into the Resource shim's search API.
 * @returns Table shim keyed by table name.
 */
async function loadTableShim() {
  const entries = await Promise.all(
    TABLES.map(async t => [t, await loadTable(t)])
  );
  return Object.fromEntries(
    entries.map(([t, rows]) => [
      t,
      {
        search: () =>
          (async function* () {
            for (const r of rows) yield r;
          })(),
      },
    ])
  );
}

/**
 * Loads generated resources.js with a Harper-like global Resource context.
 * @param opts - Whether route handling needs table-backed resources.
 * @returns Imported resources module.
 */
async function loadResources(opts = { loadTables: true }) {
  const tables = opts.loadTables ? await loadTableShim() : {};
  /**
   * Handles resource for this workflow.
   */
  class Resource {
    /**
     * Handles constructor for this workflow.
     */
    constructor() {}
  }
  globalThis.tables = tables;
  globalThis.Resource = Resource;
  if (!resourceState.resources) {
    Object.assign(resourceState, {
      resources: await import(
        pathToFileURL(resolve("harper-app/resources.js")).href
      ),
    });
  }
  return resourceState.resources;
}

// ── static + routing ────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Handles serve static for this workflow.
 * @param req - req used by this operation.
 * @param res - res used by this operation.
 */
async function serveStatic(req, res) {
  const p = staticPath(
    decodeURIComponent(new URL(req.url, DEV_URL_BASE).pathname)
  );
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

/**
 * Maps pretty routes to their generated static HTML files.
 * @param path - Request pathname.
 * @returns Static file path under harper-app/web.
 */
function staticPath(path) {
  if (path === "/") return "/index.html";
  if (path === "/firms") return "/firms.html";
  if (path === "/recruiting") return "/recruiting.html";
  if (path === "/rankings") return "/rankings.html";
  if (path.startsWith("/firms/")) return "/firm.html";
  if (path === "/advisors") return "/advisors.html";
  if (path.startsWith("/advisors/")) return "/advisor.html";
  if (path === "/teams") return "/teams.html";
  if (path.startsWith("/teams/")) return "/team.html";
  if (path.startsWith("/articles/")) return "/article.html";
  return path;
}

/**
 * Handles send json for this workflow.
 * @param res - res used by this operation.
 * @param code - code used by this operation.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
function sendJson(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/**
 * Sends JSON and returns true for route-handler control flow.
 * @param res - HTTP response.
 * @param code - HTTP status code.
 * @param body - JSON response body.
 * @returns Always true after the response is written.
 */
function sendJsonHandled(res, code, body) {
  sendJson(res, code, body);
  return true;
}

// Mimic Harper's RequestTarget (extends URLSearchParams with `.id`,
// `.pathname`, parsed `.limit`) so resources.js can read the same shape
// in dev that production hands them. Just enough for our endpoints —
// not a full reimplementation of Harper's parser.
/**
 * Handles make target for this workflow.
 * @param id - Entity identifier.
 * @param searchParams - search params used by this operation.
 * @returns The computed value.
 */
function makeTarget(id, searchParams) {
  const t = new URLSearchParams(searchParams || "");
  const lim = parseInt(t.get("limit"), 10);
  return Object.assign(t, {
    id,
    limit: Number.isFinite(lim) ? lim : undefined,
    toString: () => (id == null ? "" : String(id)),
  });
}

/**
 * Routes one HTTP request through auth, resource, table, or static handlers.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @returns Promise that resolves after the response is written.
 */
async function handle(req, res) {
  const url = new URL(req.url, DEV_URL_BASE);
  const p = url.pathname;
  try {
    await routeRequest(req, res, url);
  } catch (err) {
    console.error("500", p, err.stack || err.message || err);
    sendJson(res, 500, { error: String(err.message || err) });
  }
}

/**
 * Dispatches to the first matching dev-server route.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 */
async function routeRequest(req, res, url) {
  if (await handleAuthRoute(req, res, url.pathname)) return;
  if (await handleMcpRoute(req, res, url.pathname)) return;
  if (await handleResourceRoute(res, url)) return;
  if (await handleTableRoute(res, url.pathname)) return;
  await serveStatic(req, res);
}

/**
 * Handles the local MCP POST bridge.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
async function handleMcpRoute(req, res, path) {
  if (path !== "/mcp") return false;
  if (req.method !== "POST")
    return sendJsonHandled(res, 405, { error: "method not allowed" });
  const r = await loadResources({ loadTables: true });
  if (!r?.mcp) return sendJsonHandled(res, 500, { error: "mcp unavailable" });
  const instance = Reflect.construct(r.mcp, []);
  return sendJsonHandled(
    res,
    200,
    await instance.post(await readJsonBody(req))
  );
}

/**
 * Reads a JSON request body, returning undefined for parse errors.
 * @param req - Incoming HTTP request.
 * @returns Parsed JSON body or undefined when malformed.
 */
async function readJsonBody(req) {
  const chunks = await Array.fromAsync(req, chunk => Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return undefined;
  }
}

/**
 * Handles generated Harper resource routes.
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 * @returns Whether the route was handled.
 */
async function handleResourceRoute(res, url) {
  const noArgMatch =
    /^\/(Feed|PublicFirms|PublicAdvisors|PublicTeams|Search|RecruitingMarket|RankingsExplorer)$/.exec(
      url.pathname
    );
  const profileMatch =
    /^\/(ArticleView|FirmProfile|AdvisorProfile|TeamProfile|FirmAdvisors)\/(.+)$/.exec(
      url.pathname
    );
  if (noArgMatch)
    return await sendResource(res, noArgMatch[1], undefined, url.searchParams);
  if (profileMatch)
    return await sendResource(
      res,
      profileMatch[1],
      decodeURIComponent(profileMatch[2]),
      url.searchParams
    );
  return false;
}

/**
 * Executes one generated resource class and writes the JSON result.
 * @param res - HTTP response.
 * @param kind - Resource class name.
 * @param id - Optional resource ID.
 * @param searchParams - Request query parameters.
 * @returns True after writing the response.
 */
async function sendResource(res, kind, id, searchParams) {
  const r = await loadResources();
  const ResourceClass = r?.[kind];
  const instance = Reflect.construct(ResourceClass, []);
  return sendJsonHandled(
    res,
    200,
    await instance.get(makeTarget(id, searchParams))
  );
}

/**
 * Handles auto-export table list routes.
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
async function handleTableRoute(res, path) {
  const tableMatch = /^\/([A-Z][A-Za-z]+)\/?$/.exec(path);
  if (!tableMatch || !TABLES.includes(tableMatch[1])) return false;
  return sendJsonHandled(res, 200, await loadTable(tableMatch[1]));
}

// Hot-reload resources.js by clearing cache between requests in dev.
// (Cheap; the dataset load dominates anyway.)
/**
 * Clears the resources import cache before routing in hot mode.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 */
function devMode(req, res) {
  Object.assign(resourceState, { resources: null });
  handle(req, res);
}

createServer(process.env.HOT === "1" ? devMode : handle).listen(
  PORT,
  HOST,
  () => {
    console.log(`dev server listening on http://${HOST}:${PORT}`);
    console.log(`  static: ${ROOT}`);
    console.log(`  ops socket: ${SOCKET}`);
  }
);
