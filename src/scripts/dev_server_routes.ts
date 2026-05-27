/**
 * Routing helpers for the local dev server.
 *
 * Each handler returns `true` when it has written a response and false
 * when control should fall through to the next handler — the entrypoint
 * composes them in priority order (auth → mcp → resource → table → static).
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { loadTable } from "./dev_server_ops.js";
import { loadResources } from "./dev_server_resources.js";
import { readJsonBody, sendJsonHandled } from "./dev_server_json.js";
import { DEV_SERVER_TABLES } from "./dev_server_tables.js";

const TABLES: readonly string[] = [...DEV_SERVER_TABLES];

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
 *
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
  new (): { get(target: DevRequestTarget): Promise<unknown> };
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
 *
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
    return sendJsonHandled(res, 405, { error: "method not allowed" });
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
  /^\/(Feed|PublicFirms|PublicAdvisors|PublicTeams|Search|RecruitingMarket|RankingsExplorer)$/;
const PROFILE_RESOURCE =
  /^\/(ArticleView|FirmProfile|AdvisorProfile|TeamProfile|FirmAdvisors)\/(.+)$/;

/**
 * Handles generated Harper resource routes.
 *
 * @param res - HTTP response.
 * @param url - Parsed request URL.
 * @returns Whether the route was handled.
 */
export async function handleResourceRoute(
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const noArgMatch = NO_ARG_RESOURCE.exec(url.pathname);
  const profileMatch = PROFILE_RESOURCE.exec(url.pathname);
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
 *
 * @param res - HTTP response.
 * @param kind - Resource class name.
 * @param id - Optional resource id.
 * @param searchParams - Request query parameters.
 * @returns True after writing the response.
 */
async function sendResource(
  res: ServerResponse,
  kind: string,
  id: string | undefined,
  searchParams: URLSearchParams
): Promise<true> {
  const r = await loadResources();
  const ResourceClass = r[kind];
  if (typeof ResourceClass !== "function")
    return sendJsonHandled(res, 500, { error: `unknown resource: ${kind}` });
  const instance = Reflect.construct(ResourceClass as ResourceConstructor, []);
  return sendJsonHandled(
    res,
    200,
    await instance.get(makeTarget(id, searchParams))
  );
}

/**
 * Handles auto-export table list routes (e.g. `/Article/`).
 *
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
