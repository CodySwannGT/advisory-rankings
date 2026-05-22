import { registerEntityShells } from "../seo_shell.js";

/**
 * Register public team directory and profile URL shells.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function teamsRoutes(fastify) {
  registerEntityShells(fastify, {
    basePath: "/teams",
    directoryUrl: new URL("../web/teams.html", import.meta.url),
    profileUrl: new URL("../web/team.html", import.meta.url),
  });
}
