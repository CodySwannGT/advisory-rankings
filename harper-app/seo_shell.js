import { readFile } from "node:fs/promises";

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * Register clean directory and profile routes that serve static HTML shells.
 * @param fastify Fastify instance provided by Harper.
 * @param root0 Route shell file URLs.
 * @param root0.basePath Public directory base path.
 * @param root0.directoryUrl Directory page HTML file URL.
 * @param root0.profileUrl Profile page HTML file URL.
 */
export function registerEntityShells(
  fastify,
  { basePath, directoryUrl, profileUrl }
) {
  const html = {};
  const sendDirectory = async (_request, reply) => {
    html.directory ||= await readFile(directoryUrl, "utf8");
    return reply.headers(headers).send(html.directory);
  };
  const sendProfile = async (_request, reply) => {
    html.profile ||= await readFile(profileUrl, "utf8");
    return reply.headers(headers).send(html.profile);
  };
  fastify.get(basePath, sendDirectory);
  fastify.get(`${basePath}/:slug`, sendProfile);
}

/**
 * Register a clean route that serves one static HTML shell.
 * @param fastify Fastify instance provided by Harper.
 * @param root0 Route shell file URLs.
 * @param root0.path Public route path.
 * @param root0.shellUrl Static HTML shell file URL.
 */
export function registerSingleShell(fastify, { path, shellUrl }) {
  const html = {};
  fastify.get(path, async (_request, reply) => {
    html.page ||= await readFile(shellUrl, "utf8");
    return reply.headers(headers).send(html.page);
  });
}
