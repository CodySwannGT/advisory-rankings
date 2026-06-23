import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public investor proof packet URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function investorProofRoutes(fastify) {
  const html = {};
  fastify.get("/investor-proof", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/investor-proof.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
