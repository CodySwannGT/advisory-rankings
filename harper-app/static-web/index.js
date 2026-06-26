import { readdir, readFile } from "node:fs/promises";
import { extname } from "node:path";

const WEB_ROOT = new URL("../web/", import.meta.url);

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const CACHEABLE = new Set([".css", ".ico", ".js", ".svg"]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".svg"]);

/**
 * Register root-level static web routes for Fabric nodes that do not expose
 * Harper's static extension at the URL paths used by the HTML shells.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function staticWebRoutes(fastify) {
  const assets = await discoverAssets(WEB_ROOT);
  const notFoundShell = await readAssetBody(
    new URL("404.html", WEB_ROOT),
    ".html"
  );
  const notFoundHeaders = headersFor(".html");

  await registerAsset(fastify, "/", "index.html");
  for (const asset of assets) {
    await registerAsset(fastify, `/${asset}`, asset);
  }
  fastify.setNotFoundHandler?.((request, reply) =>
    sendNotFoundResponse(request, reply, notFoundHeaders, notFoundShell)
  );
}

/**
 * Sends either the recoverable document shell or a plain 404 response.
 * @param request Fastify request object.
 * @param reply Fastify reply object.
 * @param headers Headers for the not-found document shell.
 * @param body Preloaded 404 HTML body.
 * @returns Fastify reply result.
 */
function sendNotFoundResponse(request, reply, headers, body) {
  if (!shouldServeNotFoundShell(request)) {
    return reply.code(404).send("Not found");
  }
  return reply.code(404).headers(headers).send(body);
}

/**
 * Keeps document navigations recoverable without turning missing API or asset
 * requests into HTML pages.
 * @param request Fastify request object.
 * @returns Whether the 404 shell should be served.
 */
function shouldServeNotFoundShell(request) {
  const accept = String(request?.headers?.accept || "");
  const url = String(request?.url || "");
  if (url && isWebAsset(url.split("?")[0])) return false;
  return accept.includes("text/html");
}

/**
 * Recursively lists deployable web assets under the generated web root.
 * @param rootUrl Directory URL to scan.
 * @param prefix Relative path prefix accumulated during recursion.
 * @returns Relative asset paths safe to register as exact routes.
 */
async function discoverAssets(rootUrl, prefix = "") {
  const entries = await readdir(rootUrl, { withFileTypes: true });
  const assets = [];
  for (const entry of entries) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      assets.push(
        ...(await discoverAssets(
          new URL(`${entry.name}/`, rootUrl),
          `${name}/`
        ))
      );
      continue;
    }
    if (isWebAsset(name)) assets.push(name);
  }
  return assets;
}

/**
 * Checks whether a path is one of the static asset types served by this router.
 * @param path Relative asset path.
 * @returns Whether the asset has a known web content type.
 */
function isWebAsset(path) {
  return Object.prototype.hasOwnProperty.call(MIME, extname(path));
}

/**
 * Registers one exact static asset route.
 * @param fastify Fastify instance provided by Harper.
 * @param routePath Public URL path to register.
 * @param assetPath Relative asset path under the web root.
 */
async function registerAsset(fastify, routePath, assetPath) {
  const assetUrl = new URL(assetPath, WEB_ROOT);
  const extension = extname(assetPath);
  const body = await readAssetBody(assetUrl, extension);
  const headers = headersFor(extension);

  fastify.get(routePath, async (_request, reply) => {
    return reply.headers(headers).send(body);
  });
}

/**
 * Reads text assets as strings and binary assets as buffers.
 * @param assetUrl Static asset URL under the web root.
 * @param extension File extension including the leading dot.
 * @returns Asset body suitable for Fastify reply.send.
 */
function readAssetBody(assetUrl, extension) {
  return TEXT_EXTENSIONS.has(extension)
    ? readFile(assetUrl, "utf8")
    : readFile(assetUrl);
}

/**
 * Builds response headers for a static asset extension.
 * @param extension File extension including the leading dot.
 * @returns HTTP headers for the asset response.
 */
function headersFor(extension) {
  return {
    "content-type": MIME[extension] || "application/octet-stream",
    "cache-control": CACHEABLE.has(extension)
      ? "public, max-age=3600"
      : "no-store",
  };
}
