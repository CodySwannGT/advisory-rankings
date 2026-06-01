import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public Advisor comparison URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function compareRoutes(fastify) {
  const html = {};
  fastify.get("/compare", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/compare.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
