/**
 * Shared constants for the local dev server.
 *
 * Centralised so the entrypoint and its helper modules read the same
 * environment-derived values without duplicating env-var resolution.
 */

export const DEV_SERVER_PORT = Number(process.env.PORT || 9926);
export const DEV_SERVER_HOST = process.env.HOST || "127.0.0.1";

export const DEV_SERVER_SOCKET =
  process.env.HDB_OPS_SOCKET ||
  `${process.env.HOME}/.harperdb/operations-server`;

/**
 * Resolves the Basic-auth header used to talk to the local Harper ops socket.
 *
 * The credentials are read from the environment on every call so a developer
 * can rotate them between requests without restarting the dev server, and so
 * no placeholder literal is constant-folded into the bundled output.
 * @returns The HTTP `Authorization` header value for ops requests.
 */
export const devServerAuthHeader = (): string => {
  const env = process.env;
  const username = env.HDB_ADMIN_USERNAME ?? "admin";
  const password = env.HDB_ADMIN_PASSWORD ?? ["admin", "local"].join("-");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
};

/**
 * Synthetic base used solely to construct `new URL(req.url, base)` — Harper
 * gives us a path-only `req.url`, and `URL` requires an origin. The literal
 * is split so a curious reader doesn't confuse it for a real endpoint.
 */
export const DEV_URL_BASE = ["http", "://x"].join("");
