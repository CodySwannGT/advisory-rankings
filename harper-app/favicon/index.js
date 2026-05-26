import { readFile } from "node:fs/promises";

const cacheHeaders = {
  "cache-control": "public, max-age=3600",
};

const svgHeaders = {
  ...cacheHeaders,
  "content-type": "image/svg+xml",
};

const icoHeaders = {
  ...cacheHeaders,
  "content-type": "image/x-icon",
};

/**
 * Register explicit favicon routes for Harper deployments.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function faviconRoutes(fastify) {
  const assets = {};
  const svgUrl = new URL("../web/favicon.svg", import.meta.url);
  const icoUrl = new URL("../web/favicon.ico", import.meta.url);

  fastify.get("/favicon.svg", async (_request, reply) => {
    assets.svg ||= await readFile(svgUrl, "utf8");
    return reply.headers(svgHeaders).send(assets.svg);
  });

  fastify.get("/favicon.ico", async (_request, reply) => {
    assets.ico ||= await readFile(icoUrl, "utf8");
    return reply.headers(icoHeaders).send(assets.ico);
  });
}
