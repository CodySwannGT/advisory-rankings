// @ts-nocheck
import { randomUUID } from "node:crypto";

// Tiny in-memory session store so /Login /Logout /Me work locally.
// On the deployed cluster this is all handled by Harper's own
// session middleware (enableSessions: true in harperdb-config.yaml).
const sessionState = { sessions: {} };

/**
 * Handles local Login, Logout, and Me routes.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response.
 * @param path - Request pathname.
 * @returns Whether the route was handled.
 */
export async function handleAuthRoute(req, res, path) {
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
async function loginRoute(req, res) {
  const body = await readBody(req);
  const u = body?.email || body?.username;
  if (!u || !body?.password)
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
function logoutRoute(req, res) {
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
function meRoute(req, res) {
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
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.split(/;\s*/).find(c => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

/**
 * Handles new sid for this workflow.
 * @returns The computed value.
 */
function newSid() {
  return randomUUID();
}

/**
 * Handles read body for this workflow.
 * @param req - req used by this operation.
 * @returns The computed value.
 */
async function readBody(req) {
  const text = await new Response(req).text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Handles send json for this workflow.
 * @param res - res used by this operation.
 * @param code - code used by this operation.
 * @param body - body used by this operation.
 * @returns The computed value.
 */
function sendJson(res, code, body) {
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
function sendJsonHandled(res, code, body) {
  sendJson(res, code, body);
  return true;
}
