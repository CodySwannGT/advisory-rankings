/**
 * JSON response helpers shared by every dev-server route.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Writes a JSON response with explicit Content-Length and no-store caching.
 *
 * @param res - HTTP response.
 * @param code - HTTP status code.
 * @param body - JSON-serialisable response body.
 */
export function sendJson(
  res: ServerResponse,
  code: number,
  body: unknown
): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/**
 * Sends JSON and returns true so route handlers can `return sendJsonHandled(...)`.
 *
 * @param res - HTTP response.
 * @param code - HTTP status code.
 * @param body - JSON-serialisable response body.
 * @returns Always true after the response is written.
 */
export function sendJsonHandled(
  res: ServerResponse,
  code: number,
  body: unknown
): true {
  sendJson(res, code, body);
  return true;
}

/**
 * Reads a JSON request body, returning undefined for empty or malformed input.
 *
 * @param req - Incoming HTTP request.
 * @returns Parsed JSON body or undefined when the body is empty or invalid.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks = await Array.fromAsync(req, chunk =>
    Buffer.from(chunk as Buffer | string)
  );
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return undefined;
  }
}
