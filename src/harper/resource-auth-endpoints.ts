import type {
  Context,
  JsonBody,
  RouteTarget,
} from "../types/harper-resource.js";

import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} from "./resource-login-throttle.js";
import { requireSameOrigin } from "./resource-request-origin.js";

/** Response from `Login.post` describing the authentication result. */
interface LoginResponse {
  readonly ok: true;
  readonly username: string;
}

/** Response from `Logout.post` describing the logout result. */
interface LogoutResponse {
  readonly ok: true;
}

/** Response when `Me.get` finds an authenticated browser session user. */
interface MeAuthenticated {
  readonly authenticated: true;
  readonly username: string;
  readonly role: string | null;
}

/** Response when `Me.get` finds no authenticated browser session user. */
interface MeAnonymous {
  readonly authenticated: false;
}

/** Response from `Me.get` describing the current browser session user. */
type MeResponse = MeAuthenticated | MeAnonymous;

/** Body shape `Login.post` extracts from its variadic Harper arguments. */
interface LoginBody {
  readonly email?: unknown;
  readonly username?: unknown;
  readonly password?: unknown;
}

/** Subset of Harper's `Session` shape that this module exercises. */
interface SessionShape {
  readonly id?: unknown;
  readonly update?: (updatedSession: JsonBody) => unknown;
  readonly delete?: (id: unknown) => unknown;
}

/** Error subclass carrying an HTTP-ish status code that Harper preserves. */
class StatusError extends Error {
  readonly status: number;

  /** Harper's thrown-error response writer reads `statusCode`, not `status`. */
  readonly statusCode: number;

  /**
   * Constructs a `StatusError` with a message and an HTTP-ish status code.
   * @param message - Human-readable error message returned to the client.
   * @param status - HTTP status code Harper exposes on the wire.
   */
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * Authenticates browser sessions against Harper's built-in login bridge.
 */
export class Login extends Resource {
  /**
   * Keeps the login endpoint reachable before a session exists.
   * @returns True so anonymous visitors can attempt login.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Authenticates a browser session with Harper credentials.
   * @param args - Harper Resource POST arguments containing the JSON body.
   * @returns Login status and normalized username.
   */
  async post(...args: readonly unknown[]): Promise<LoginResponse> {
    requireSameOrigin(this.getContext?.());
    const body = findLoginBody(args);
    const login = asLoginFn(this.getContext());
    const username = pickString(body.email) ?? pickString(body.username);
    const password = pickString(body.password);
    if (!username || !password) throwStatus("email and password required", 400);
    assertLoginAllowed(username);
    try {
      await login(username, password);
    } catch (_error) {
      recordLoginFailure(username);
      throwStatus("Invalid credentials", 401);
    }
    recordLoginSuccess(username);
    return { ok: true, username };
  }
}

/** Browser session logout resource. */
export class Logout extends Resource {
  /**
   * Keeps logout available when a stale browser session needs clearing.
   * @returns True so logged-in visitors can clear their session.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Clears session state while tolerating the lighter local Harper shim.
   * Absent session helpers (local shim) are skipped via optional calls,
   * but a helper that exists and THROWS is a real logout failure — the
   * server-side session may survive — so it surfaces as a 500 instead
   * of a false `{ ok: true }`.
   * @returns Logout status after session cleanup.
   */
  async post(): Promise<LogoutResponse> {
    requireSameOrigin(this.getContext?.());
    const session = asSession(readSession(this.getContext()));
    try {
      await session?.update?.({});
      await session?.delete?.(session.id);
    } catch (error) {
      throwStatus(`Logout failed: ${String(error)}`, 500);
    }
    return { ok: true };
  }
}

/** Current user resource. */
export class Me extends Resource {
  /**
   * Exposes authentication state without forcing the UI to probe protected routes.
   * @returns True so the UI can decide whether to show login controls.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Normalizes Harper's session user into the small shape consumed by the navbar.
   * @param _target - Unused Harper route target; the handler reads session state.
   * @returns Current browser session user state.
   */
  async get(_target?: RouteTarget): Promise<MeResponse> {
    const user = this.getCurrentUser();
    if (!user) return { authenticated: false };
    const role = pickString(user.role?.role) ?? null;
    return {
      authenticated: true,
      username: user.username,
      role,
    };
  }
}

/**
 * Walks the variadic args Harper hands to `post` and returns the first
 * value that looks like a submitted JSON login body. Falls back to an
 * empty object so callers can read fields uniformly.
 * @param args - Variadic Harper POST arguments.
 * @returns The detected login body, or an empty object when none found.
 */
function findLoginBody(args: readonly unknown[]): LoginBody {
  for (const value of args) {
    if (isLoginBody(value)) return value;
  }
  return {};
}

/**
 * Type predicate identifying the JSON body object from Harper's variadic
 * resource arguments.
 * @param value - Candidate argument passed into the resource method.
 * @returns True when the argument looks like the submitted login JSON.
 */
function isLoginBody(value: unknown): value is LoginBody {
  if (!value || typeof value !== "object") return false;
  const obj: Readonly<Record<string, unknown>> = value as Readonly<
    Record<string, unknown>
  >;
  return (
    typeof obj["email"] !== "undefined" ||
    typeof obj["username"] !== "undefined" ||
    typeof obj["password"] !== "undefined"
  );
}

/**
 * Returns the candidate when it is a non-empty string, otherwise undefined.
 * Used to normalize the loosely-typed body fields before validation.
 * @param value - Candidate value pulled from a JSON body.
 * @returns The string when present and non-empty, otherwise undefined.
 */
function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Raises an HTTP-ish error that Harper resource handlers preserve for clients.
 * Uses the dedicated `StatusError` subclass so the `status` field rides on
 * the instance without any `as`-cast on a plain `Error`.
 * @param message - Human-readable error returned to the browser.
 * @param status - HTTP status code associated with the failed request.
 */
function throwStatus(message: string, status: number): never {
  throw new StatusError(message, status);
}

/**
 * Pulls the `login` helper out of `Resource.prototype.getContext()`.
 * Harper's `Context` carries `login(username, password) => Promise<string>`;
 * the `SourceContext` branch of the union does not, and the local shim
 * used by `bun test` may omit it entirely.
 * @param ctx - Raw value returned by `Resource.prototype.getContext()`.
 * @returns The bound `login` function from the context.
 */
function asLoginFn(ctx: unknown): Context["login"] {
  if (ctx && typeof ctx === "object" && "login" in ctx) {
    const candidate = (ctx as Readonly<Record<"login", unknown>>).login;
    if (typeof candidate === "function") {
      return candidate as Context["login"];
    }
  }
  throwStatus("login context unavailable", 500);
}

/**
 * Pulls the `session` field off `getContext()` without forcing the rest of
 * the module to traffic in the `Context | SourceContext` union directly.
 * Returns `undefined` when the underlying context omits sessions — the
 * local Harper shim used by tests sometimes does.
 * @param ctx - Raw value returned by `Resource.prototype.getContext()`.
 * @returns The session value, or undefined when no session is attached.
 */
function readSession(ctx: unknown): unknown {
  if (!ctx || typeof ctx !== "object" || !("session" in ctx)) return undefined;
  return (ctx as Readonly<Record<"session", unknown>>).session;
}

/**
 * Narrows the loosely-typed `session` field on `Context` down to the small
 * subset of helpers the logout flow probes. Returns undefined when the
 * field is absent so callers can no-op cleanly under the local shim.
 * @param session - Raw `Context.session` value.
 * @returns A `SessionShape` view, or undefined when no session exists.
 */
function asSession(session: unknown): SessionShape | undefined {
  if (!session || typeof session !== "object") return undefined;
  return session as SessionShape;
}
