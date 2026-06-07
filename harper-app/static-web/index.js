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

/**
 * Register root-level static web routes for Fabric nodes that do not expose
 * Harper's static extension at the URL paths used by the HTML shells.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function staticWebRoutes(fastify) {
  const assets = await discoverAssets(WEB_ROOT);

  registerAsset(fastify, "/", "index.html");
  for (const asset of assets) {
    registerAsset(fastify, `/${asset}`, asset);
  }
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
function registerAsset(fastify, routePath, assetPath) {
  const assetUrl = new URL(assetPath, WEB_ROOT);
  const cache = { body: undefined };

  fastify.get(routePath, async (_request, reply) => {
    cache.body ||= await readFile(assetUrl);
    const extension = extname(assetPath);
    return reply.headers(headersFor(extension)).send(cache.body);
  });
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
