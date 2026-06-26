import { registerSingleShell } from "../seo_shell.js";

/**
 * Register the public source article triage URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function sourceTriageRoutes(fastify) {
  registerSingleShell(fastify, {
    path: "/source-triage",
    shellUrl: new URL("../web/source-triage.html", import.meta.url),
  });
}
