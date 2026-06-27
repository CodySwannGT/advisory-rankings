/**
 * Routing helpers for the local dev server.
 *
 * Each handler returns `true` when it has written a response and false
 * when control should fall through to the next handler — the entrypoint
 * composes them in priority order (auth → mcp → resource → table → static).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  matchLegacyDetailShell,
  prefersHtmlDocument,
  type DetailRequestHeaders,
} from "../harper/detail-shell-negotiation.js";
import { currentUserFromRequest } from "./dev_server_auth.js";
import { loadTable } from "./dev_server_ops.js";
import { loadResources } from "./dev_server_resources.js";
import { readJsonBody, sendJsonHandled } from "./dev_server_json.js";
import { DEV_SERVER_TABLES } from "./dev_server_tables.js";
import { DEV_SERVER_WEB_ROOT } from "./dev_server_static.js";

const TABLES: readonly string[] = [...DEV_SERVER_TABLES];
const METHOD_NOT_ALLOWED = "method not allowed";

/**
 * Harper-flavored request target: a `URLSearchParams` instance with the
 * extra `id`, `pathname`, and parsed `.limit` slots the generated
 * resources read. Not a full reimplementation of Harper's parser — just
 * the surface our endpoints actually touch.
 */
type DevRequestTarget = URLSearchParams & {
  readonly id: string | undefined;
  readonly limit: number | undefined;
  toString(): string;
};

/**
 * Builds a `DevRequestTarget` from a route id and the parsed query string.
 * @param id - Resource id parsed from the path, or undefined for list routes.
 * @param searchParams - The request's parsed query parameters.
 * @returns Harper-shaped target object.
 */
function makeTarget(
  id: string | undefined,
  searchParams: URLSearchParams | string | undefined
): DevRequestTarget {
  const params = new URLSearchParams(searchParams ?? "");
  const limRaw = params.get("limit");
  const lim = limRaw === null ? Number.NaN : parseInt(limRaw, 10);
  return Object.assign(params, {
    id,
    limit: Number.isFinite(lim) ? lim : undefined,
    toString: () => (id == null ? "" : String(id)),
  }) as DevRequestTarget;
}

/**
 * Constructor signature for a generated Harper resource class. The
 * generated `harper-app/resources.js` module exposes one such constructor
 * per `@export` resource; we only model the single `get(target)` method
 * the dev server actually invokes.
 */
interface ResourceConstructor {
  new (): {
    get?(target: DevRequestTarget): Promise<unknown>;
    post?(...args: readonly unknown[]): Promise<unknown>;
  };
}

/**
 * Constructor signature for the generated `mcp` resource. The local POST
 * bridge calls `instance.post(body)`; no other method is needed in dev.
 */
interface McpConstructor {
  new (): { post(body: unknown): Promise<unknown> };
}

/**
 * Handles the local MCP POST bridge.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
export async function handleMcpRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/mcp") return false;
  if (req.method !== "POST")
    return sendJsonHandled(res, 405, { error: METHOD_NOT_ALLOWED });
  const r = await loadResources({ loadTables: true });
  const mcp = r["mcp"];
  if (typeof mcp !== "function")
    return sendJsonHandled(res, 500, { error: "mcp unavailable" });
  const instance = Reflect.construct(mcp as McpConstructor, []);
  return sendJsonHandled(
    res,
    200,
    await instance.post(await readJsonBody(req))
  );
}

const NO_ARG_RESOURCE =
  /^\/(Feed|PublicFirms|PublicAdvisors|PublicTeams|Search|RecruitingMarket|RecruitingDealDataGaps|RankingsExplorer|AdvisorComparison|RegulatoryDiscrepancyQueue|AdvisorResearchQueue|InvestorProofPacket|AdvisorCorrectionRequest|McpCatalog)$/;
const PROFILE_RESOURCE =
  /^\/(ArticleView|FirmProfile|AdvisorProfile|TeamProfile|FirmAdvisors|RegulatoryDiscrepancyReview|AdvisorCorrectionRequest)\/(.+)$/;
const TABLELESS_RESOURCES = new Set(["McpCatalog"]);

/**
 * Serves the AdvisorBook HTML shell for browser document navigations to the
 * legacy detail data-routes, mirroring `harper-app/detail_shell.js` on the
 * deployed Harper component. The SPA's own `Accept: application/json` data
 * fetches are left to fall through to {@link handleResourceRoute}.
 * @param req - Incoming HTTP request (read for negotiation headers).
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 * @returns Whether the request was handled by serving a shell.
 */
export async function handleDetailShellRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const shell = matchLegacyDetailShell(url.pathname);
  if (!shell) return false;
  if (!prefersHtmlDocument(req.headers as DetailRequestHeaders)) return false;
  const html = await readFile(join(DEV_SERVER_WEB_ROOT, shell), "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
  return true;
}

/**
 * Handles generated Harper resource routes.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 * @returns Whether the route was handled.
 */
export async function handleResourceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const noArgMatch = NO_ARG_RESOURCE.exec(url.pathname);
  const profileMatch = PROFILE_RESOURCE.exec(url.pathname);
  if (noArgMatch)
    return await sendResource(
      req,
      res,
      noArgMatch[1],
      undefined,
      url.searchParams
    );
  if (profileMatch)
    return await sendResource(
      req,
      res,
      profileMatch[1],
      decodeURIComponent(profileMatch[2]),
      url.searchParams
    );
  return false;
}

/**
 * Executes one generated resource class and writes the JSON result.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param kind - Resource class name.
 * @param id - Optional resource id.
 * @param searchParams - Request query parameters.
 * @returns True after writing the response.
 */
async function sendResource(
  req: IncomingMessage,
  res: ServerResponse,
  kind: string,
  id: string | undefined,
  searchParams: URLSearchParams
): Promise<true> {
  const r = await loadResources({ loadTables: !TABLELESS_RESOURCES.has(kind) });
  const ResourceClass = r[kind];
  if (typeof ResourceClass !== "function")
    return sendJsonHandled(res, 500, { error: `unknown resource: ${kind}` });
  const instance = Reflect.construct(ResourceClass as ResourceConstructor, []);
  installCurrentUser(instance, req);
  if (req.method === "POST") {
    if (typeof instance.post !== "function")
      return sendJsonHandled(res, 405, { error: METHOD_NOT_ALLOWED });
    return sendJsonHandled(
      res,
      200,
      await instance.post(makeTarget(id, searchParams), await readJsonBody(req))
    );
  }
  if (req.method !== "GET" && req.method !== "HEAD")
    return sendJsonHandled(res, 405, { error: METHOD_NOT_ALLOWED });
  if (typeof instance.get !== "function")
    return sendJsonHandled(res, 405, { error: METHOD_NOT_ALLOWED });
  return sendJsonHandled(
    res,
    200,
    await instance.get(makeTarget(id, searchParams))
  );
}

/**
 * Installs a local-session current-user hook on generated resources.
 * @param instance - Generated resource instance.
 * @param req - Incoming HTTP request.
 */
function installCurrentUser(instance: object, req: IncomingMessage): void {
  Object.assign(instance, {
    getCurrentUser: () => currentUserFromRequest(req),
  });
}

/**
 * Handles auto-export table list routes (e.g. `/Article/`).
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
export async function handleTableRoute(
  res: ServerResponse,
  path: string
): Promise<boolean> {
  const tableMatch = /^\/([A-Z][A-Za-z]+)\/?$/.exec(path);
  if (!tableMatch || !TABLES.includes(tableMatch[1])) return false;
  return sendJsonHandled(res, 200, await loadTable(tableMatch[1]));
}
