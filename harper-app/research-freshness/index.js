import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public research freshness queue URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function researchFreshnessRoutes(fastify) {
  const html = {};
  fastify.get("/research/freshness", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/research-freshness.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
