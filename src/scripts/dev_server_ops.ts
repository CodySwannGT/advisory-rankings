/**
 * Operations-API helpers for the local dev server.
 *
 * Backend store is the running local Harper, accessed exclusively over its
 * operations-server Unix socket — the same socket `bun run seed`,
 * `bun run verify`, and `bun run preview` already use. The ops API is a
 * Harper-private surface with no TypeScript contract published by the
 * `harperdb` package; for that reason the call/response shapes are treated
 * as `unknown` and narrowed locally.
 */

import { request as httpRequest, type IncomingMessage } from "node:http";

import {
  DEV_SERVER_SOCKET,
  devServerAuthHeader,
} from "./dev_server_constants.js";

/**
 * Performs one POST against Harper's operations-server Unix socket.
 *
 * @param body - JSON-serializable ops-API request body.
 * @returns The parsed JSON response.
 */
export function opsCall(body: unknown): Promise<unknown> {
  return new Promise<unknown>((resolveP, reject) => {
    const req = httpRequest(
      {
        socketPath: DEV_SERVER_SOCKET,
        method: "POST",
        path: "/",
        headers: {
          "Content-Type": "application/json",
          Authorization: devServerAuthHeader(),
        },
      },
      async res => {
        res.setEncoding("utf8");
        await readOpsResponse(res, resolveP, reject);
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Reads and parses the ops-API JSON response body, settling the caller's
 * promise. Split out of the response callback so the awaited stream read is
 * defined at the top of its own scope rather than after `res.setEncoding`.
 * @param res - Incoming ops-API response stream (utf8 encoding already set).
 * @param resolveP - Resolver for the parsed JSON value.
 * @param reject - Rejector invoked when the body is not valid JSON.
 * @returns Resolves once the response has been parsed and delivered.
 */
async function readOpsResponse(
  res: IncomingMessage,
  resolveP: (value: unknown) => void,
  reject: (reason?: unknown) => void
): Promise<void> {
  const chunks = await Array.fromAsync(res, chunk => chunk as string);
  const buf = chunks.join("");
  try {
    resolveP(JSON.parse(buf) as unknown);
  } catch (_error) {
    reject(new Error(`bad json from ops API: ${buf.slice(0, 200)}`));
  }
}

/**
 * Type guard for `{ data: unknown[] }` ops-API envelopes.
 *
 * @param value - Possible ops-API envelope.
 * @returns True when `value.data` is an array.
 */
/** Ops-API envelope shape for SQL responses whose `data` is an array. */
interface DataArrayEnvelope {
  readonly data: readonly unknown[];
}

/** Loose ops-API envelope shape used for narrowing before array-checking. */
interface DataEnvelope {
  readonly data: unknown;
}

/**
 * Type guard for `{ data: unknown[] }` ops-API envelopes.
 *
 * @param value - Possible ops-API envelope.
 * @returns True when `value.data` is an array.
 */
function hasDataArray(value: unknown): value is DataArrayEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    Array.isArray((value as DataEnvelope).data)
  );
}

/**
 * Loads every row from `data.<name>` via the ops-API SQL endpoint.
 *
 * @param name - Harper table name under the `data` database.
 * @returns Rows as opaque records; callers narrow on use.
 */
export async function loadTable(name: string): Promise<readonly unknown[]> {
  const res = await opsCall({
    operation: "sql",
    sql: `SELECT * FROM data.${name}`,
  });
  if (Array.isArray(res)) return res;
  if (hasDataArray(res)) return res.data;
  return [];
}
