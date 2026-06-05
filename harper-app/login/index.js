import { registerSingleShell } from "../seo_shell.js";

/**
 * Register the clean public login URL shell.
 * @param fastify Fastify instance provided by Harper.
 */
export default async function loginRoutes(fastify) {
  registerSingleShell(fastify, {
    path: "/login",
    shellUrl: new URL("../web/login.html", import.meta.url),
  });

  fastify.get("/login.html", async (_request, reply) =>
    reply.redirect(302, "/login")
  );
}
