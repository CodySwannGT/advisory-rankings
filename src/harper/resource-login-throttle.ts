/**
 * Per-account failed-login throttle for the `/Login` resource.
 *
 * Harper does not throttle `context.login()` itself, so without this an
 * attacker can brute-force passwords online at wire speed. The throttle is
 * intentionally per-thread and in-memory (each Harper worker keeps its own
 * instance): it is a best-effort brake, not a distributed lockout, and it
 * resets on restart. Locks are keyed by the submitted username so a lock on
 * one account never affects another; map growth is bounded by evicting the
 * oldest entries once `MAX_TRACKED` accounts are being watched.
 *
 * State is encapsulated in a class instance so the throttle bookkeeping is
 * the only mutable surface, kept off the module scope behind a typed API.
 */

/** Failure state for one submitted username. */
interface AttemptState {
  readonly failures: number;
  readonly lockedUntil: number;
}

/** Failures allowed before locks start. */
const FREE_ATTEMPTS = 5;
/** First lock duration; doubles per additional failure. */
const BASE_LOCK_MS = 2_000;
/** Ceiling for one lock window. */
const MAX_LOCK_MS = 15 * 60_000;
/** Upper bound on tracked usernames (oldest evicted past this). */
const MAX_TRACKED = 10_000;

/**
 * Normalizes a submitted username into a throttle key.
 * @param username Submitted username or email.
 * @returns Case-folded trimmed key.
 */
function keyFor(username: string): string {
  return username.trim().toLowerCase();
}

/** In-memory failed-login tracker. One instance per worker thread. */
class LoginThrottle {
  private readonly attempts = new Map<string, AttemptState>();

  /**
   * Throws a 429 when the account is inside a failed-login lock window.
   * @param username Submitted username or email.
   * @param now Current epoch milliseconds.
   * @throws Error tagged with status/statusCode 429 while locked.
   */
  assertAllowed(username: string, now: number): void {
    const state = this.attempts.get(keyFor(username));
    if (state && state.lockedUntil > now) {
      const error = new Error(
        "Too many failed login attempts; try again later"
      );
      Object.assign(error, { status: 429, statusCode: 429 });
      throw error;
    }
  }

  /**
   * Records a failed login, extending the lock window exponentially once the
   * account has burned its free attempts.
   * @param username Submitted username or email.
   * @param now Current epoch milliseconds.
   */
  recordFailure(username: string, now: number): void {
    const key = keyFor(username);
    const failures = (this.attempts.get(key)?.failures ?? 0) + 1;
    const excess = failures - FREE_ATTEMPTS;
    const lockMs =
      excess > 0 ? Math.min(BASE_LOCK_MS * 2 ** (excess - 1), MAX_LOCK_MS) : 0;
    if (!this.attempts.has(key) && this.attempts.size >= MAX_TRACKED) {
      const oldest = this.attempts.keys().next().value;
      if (typeof oldest === "string") this.attempts.delete(oldest);
    }
    this.attempts.set(key, { failures, lockedUntil: now + lockMs });
  }

  /**
   * Clears failure state after a successful login.
   * @param username Submitted username or email.
   */
  recordSuccess(username: string): void {
    this.attempts.delete(keyFor(username));
  }

  /** Empties the tracker. Test-only helper. */
  reset(): void {
    this.attempts.clear();
  }
}

const throttle = new LoginThrottle();

/**
 * Throws a 429 when the account is inside a failed-login lock window.
 * @param username Submitted username or email.
 * @param now Current epoch milliseconds (injectable for tests).
 */
export function assertLoginAllowed(
  username: string,
  now: number = Date.now()
): void {
  throttle.assertAllowed(username, now);
}

/**
 * Records a failed login and extends the lock window exponentially.
 * @param username Submitted username or email.
 * @param now Current epoch milliseconds (injectable for tests).
 */
export function recordLoginFailure(
  username: string,
  now: number = Date.now()
): void {
  throttle.recordFailure(username, now);
}

/**
 * Clears failure state after a successful login.
 * @param username Submitted username or email.
 */
export function recordLoginSuccess(username: string): void {
  throttle.recordSuccess(username);
}

/** Empties the throttle. Test-only helper. */
export function resetLoginThrottle(): void {
  throttle.reset();
}
