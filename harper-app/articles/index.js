import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register public article detail URL shells.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function articlesRoutes(fastify) {
  const html = {};
  fastify.get("/articles/:slug", async (_request, reply) => {
    html.profile ||= await readFile(
      new URL("../web/article.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.profile);
  });
}
