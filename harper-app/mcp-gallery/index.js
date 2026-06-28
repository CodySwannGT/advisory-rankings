import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register the public MCP gallery URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function mcpGalleryRoutes(fastify) {
  const html = {};
  const sendGallery = async (_request, reply) => {
    html.page ||= await readFile(
      new URL("../web/mcp-gallery.html", import.meta.url),
      "utf8"
    );
    return reply.headers(headers).send(html.page);
  };
  fastify.get("/mcp-gallery", sendGallery);
}
