import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the clean analyst correction request inbox URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function correctionInboxRoutes(fastify) {
  const html = {};
  fastify.get("/corrections", async (_request, reply) => {
    try {
      html.page ||= await readFile(
        new URL("../web/correction-inbox.html", import.meta.url),
        "utf8"
      );
    } catch (error) {
      console.error("Failed to load correction request inbox shell", error);
      return reply.code(500).send({ error: "Unable to load page shell" });
    }
    return reply.headers(headers).send(html.page);
  });
}
