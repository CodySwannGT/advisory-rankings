import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public branch explorer URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function branchesRoutes(fastify) {
  const html = {};
  fastify.get("/branches", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/branches.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
