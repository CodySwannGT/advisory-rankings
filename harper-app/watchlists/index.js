import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the signed-in Watchlists management URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function watchlistsRoutes(fastify) {
  const html = {};
  fastify.get("/watchlists", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/watchlists.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
