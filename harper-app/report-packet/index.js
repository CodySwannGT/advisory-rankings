import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public report packet URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function reportPacketRoutes(fastify) {
  const html = {};
  fastify.get("/report-packet", async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/report-packet.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  });
}
