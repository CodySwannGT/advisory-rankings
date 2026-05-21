import { registerEntityShells } from "../seo_shell.js";

/**
 * Register public firm directory and profile URL shells.
 *
 * @param fastify Fastify instance provided by Harper.
 */
export default async function firmsRoutes(fastify) {
  registerEntityShells(fastify, {
    directoryUrl: new URL("../web/firms.html", import.meta.url),
    profileUrl: new URL("../web/firm.html", import.meta.url),
  });
}
