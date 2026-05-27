import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { text as readStreamText } from "node:stream/consumers";

/**
 * In-memory representation of a single dev-server session row.
 */
interface DevSession {
  readonly username: string;
}

/**
 * Shape of the in-memory session map used by the local dev server.
 */
interface SessionState {
  readonly sessions: Readonly<Record<string, DevSession>>;
}

/**
 * A JSON object literal that can be serialized as part of a response.
 */
interface JsonObject {
  readonly [k: string]: JsonValue;
}

/**
 * A JSON value that can be serialized as an HTTP response body.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | ReadonlyArray<JsonValue>;

/**
 * Untrusted JSON body posted to `/Login`. All fields are `unknown`
 * because they originate from the wire and must be narrowed at the
 * consumer.
 */
interface LoginBody {
  readonly email?: unknown;
  readonly username?: unknown;
  readonly password?: unknown;
}

// Tiny in-memory session store so /Login /Logout /Me work locally.
// On the deployed cluster this is all handled by Harper's own
// session middleware (enableSessions: true in harperdb-config.yaml).
const sessionState: SessionState = { sessions: {} };

/**
 * Handles local Login, Logout, and Me routes.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
export async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path === "/Login" && req.method === "POST")
    return await loginRoute(req, res);
  if (path === "/Logout" && req.method === "POST") return logoutRoute(req, res);
  if (path === "/Me") return meRoute(req, res);
  return false;
}

/**
 * Accepts any non-empty credentials in the local-only dev server.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @returns True after writing the response.
 */
async function loginRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const body = await readBody(req);
  const u = pickString(body?.email) ?? pickString(body?.username);
  const password = pickString(body?.password);
  if (!u || !password)
    return sendJsonHandled(res, 400, { error: "email and password required" });
  const sid = newSid();
  Object.assign(sessionState, {
    sessions: { ...sessionState.sessions, [sid]: { username: u } },
  });
  res.setHeader("Set-Cookie", `dev_sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  return sendJsonHandled(res, 200, { ok: true, username: u });
}

/**
 * Clears the local development session cookie.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @returns True after writing the response.
 */
function logoutRoute(req: IncomingMessage, res: ServerResponse): boolean {
  const sid = readCookie(req, "dev_sid");
  if (sid)
    Object.assign(sessionState, {
      sessions: Object.fromEntries(
        Object.entries(sessionState.sessions).filter(([key]) => key !== sid)
      ),
    });
  res.setHeader("Set-Cookie", "dev_sid=; Path=/; Max-Age=0");
  return sendJsonHandled(res, 200, { ok: true });
}

/**
 * Returns the local development session state.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @returns True after writing the response.
 */
function meRoute(req: IncomingMessage, res: ServerResponse): boolean {
  const sid = readCookie(req, "dev_sid");
  const sess = sid ? sessionState.sessions[sid] : null;
  return sendJsonHandled(
    res,
    200,
    sess
      ? { authenticated: true, username: sess.username, role: "super_user" }
      : { authenticated: false }
  );
}

/**
 * Handles read cookie for this workflow.
 * @param req - req used by this operation.
 * @param name - Display name or option name.
 * @returns The decoded cookie value, or null when absent.
 */
function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie ?? "";
  const m = raw.split(/;\s*/).find(c => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

/**
 * Handles new sid for this workflow.
 * @returns The computed value.
 */
function newSid(): string {
  return randomUUID();
}

/**
 * Handles read body for this workflow.
 * @param req - req used by this operation.
 * @returns The parsed JSON body or null when absent/invalid.
 */
async function readBody(req: IncomingMessage): Promise<LoginBody | null> {
  const text = await readRequestText(req);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as LoginBody;
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the raw text body off a Node IncomingMessage. Uses
 * `node:stream/consumers` so the stream is drained without an
 * intermediate mutable array.
 * @param req - Incoming HTTP request.
 * @returns The full request body as a UTF-8 string.
 */
async function readRequestText(req: IncomingMessage): Promise<string> {
  return await readStreamText(req);
}

/**
 * Returns the value when it is a non-empty string, otherwise undefined.
 * @param value - Untrusted input value.
 * @returns The string when non-empty, otherwise undefined.
 */
function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Handles send json for this workflow.
 * @param res - res used by this operation.
 * @param code - code used by this operation.
 * @param body - body used by this operation.
 */
function sendJson(res: ServerResponse, code: number, body: JsonValue): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/**
 * Sends JSON and returns true for route-handler control flow.
 * @param res - HTTP response.
 * @param code - HTTP status code.
 * @param body - JSON response body.
 * @returns Always true after the response is written.
 */
function sendJsonHandled(
  res: ServerResponse,
  code: number,
  body: JsonValue
): boolean {
  sendJson(res, code, body);
  return true;
}
