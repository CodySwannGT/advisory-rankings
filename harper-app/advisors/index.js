import { registerEntityShells } from "../seo_shell.js";

/**
 * Register public advisor directory and profile URL shells.
 *
 * @param fastify Fastify instance provided by Harper.
 */
export default async function advisorsRoutes(fastify) {
  registerEntityShells(fastify, {
    directoryUrl: new URL("../web/advisors.html", import.meta.url),
    profileUrl: new URL("../web/advisor.html", import.meta.url),
  });
}
