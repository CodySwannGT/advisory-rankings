// @ts-nocheck
/**
 * Authenticates browser sessions against Harper's built-in login bridge.
 */
export class Login extends Resource {
  /**
   * Keeps the login endpoint reachable before a session exists.
   * @returns True so anonymous visitors can attempt login.
   */
  allowCreate() {
    return true;
  }

  /**
   * Authenticates a browser session with Harper credentials.
   * @param {...any} args - Harper Resource POST arguments containing the JSON body.
   * @returns Login status and normalized username.
   */
  async post(...args) {
    const body = args.find(candidateLoginBody) || {};
    const ctx = this.getContext();
    const username = body.email || body.username;
    const password = body.password;
    if (!username || !password) throwStatus("email and password required", 400);
    try {
      await ctx.login(username, password);
    } catch (_error) {
      throwStatus("Invalid credentials", 401);
    }
    return { ok: true, username };
  }
}

/** Browser session logout resource. */
export class Logout extends Resource {
  /**
   * Keeps logout available when a stale browser session needs clearing.
   * @returns True so logged-in visitors can clear their session.
   */
  allowCreate() {
    return true;
  }

  /**
   * Clears session state while tolerating the lighter local Harper shim.
   * @returns Logout status after best-effort session cleanup.
   */
  async post() {
    const ctx = this.getContext();
    await maybeCall(() => ctx.session?.update?.({}));
    await maybeCall(() => ctx.session?.delete?.(ctx.session.id));
    return { ok: true };
  }
}

/** Current user resource. */
export class Me extends Resource {
  /**
   * Exposes authentication state without forcing the UI to probe protected routes.
   * @returns True so the UI can decide whether to show login controls.
   */
  allowRead() {
    return true;
  }

  /**
   * Normalizes Harper's session user into the small shape consumed by the navbar.
   * @returns Current browser session user state.
   */
  async get() {
    const user = this.getCurrentUser();
    return user
      ? {
          authenticated: true,
          username: user.username,
          role: user.role?.role || null,
        }
      : { authenticated: false };
  }
}

/**
 * Identifies the body object from Harper's variadic resource arguments.
 * @param value - Candidate argument passed into the resource method.
 * @returns True when the argument looks like the submitted login JSON.
 */
function candidateLoginBody(value) {
  return (
    value &&
    typeof value === "object" &&
    (value.email || value.username || value.password)
  );
}
/**
 * Raises an HTTP-ish error that Harper resource handlers preserve for clients.
 * @param message - Human-readable error returned to the browser.
 * @param status - HTTP status code associated with the failed request.
 */
function throwStatus(message, status) {
  const error = new Error(message);
  Object.assign(error, { status });
  throw error;
}

/**
 * Invokes optional session helpers without failing local shim-backed tests.
 * @param operation - Deferred Harper session operation.
 * @returns Resolves after the helper succeeds or is intentionally skipped.
 */
async function maybeCall(operation) {
  try {
    await operation();
  } catch (_error) {
    // Some Harper shims omit session helpers during local resource tests.
  }
}
