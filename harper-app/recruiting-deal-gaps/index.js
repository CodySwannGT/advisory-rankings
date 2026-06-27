import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public recruiting deal gap queue URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function recruitingDealGapRoutes(fastify) {
  const html = {};
  fastify.get("/recruiting/deal-gaps", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/recruiting-deal-gaps.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
