// Transient-failure retry for same-origin resource fetches.
//
// The shared Fabric dev serving node intermittently resets connections
// (`net::ERR_CONNECTION_RESET`) under the browser's concurrent request
// bursts. A single un-retried reset on a resource fetch (e.g. `/Feed` during
// a feed-filter change) surfaces `fetch` as a thrown `TypeError` and leaves a
// dead-end error card, which repeatedly broke the deploy smoke gate. Retrying
// *idempotent* requests a few times with backoff absorbs those blips.
//
// A second failure mode is the deploy *cutover*: when the Fabric component
// restarts, the serving node cold-starts and the first request after the
// restart has been observed to hang ~30s before responding (or never settle).
// A bare `fetch` has no timeout, so that one unlucky request pins the whole
// page open and then dead-ends the feed and session UI for the full stall.
// To bound it, every attempt runs under a per-attempt timeout: a fetch that
// does not settle in time is aborted, which surfaces as a thrown error and is
// retried exactly like a connection reset — so the retry lands on the
// (now-warmed) node instead of blocking on the cold one.
//
// Scope is deliberately narrow: only thrown fetch errors (the observed reset
// signature) and timed-out attempts are retried. A request that completes with
// an HTTP error status is returned as-is so deterministic failures (404s) and
// the existing manual-retry UI for server error responses keep their current
// behavior. See docs/fabric-runbook.md §6.

/** Opaque timer handle returned by the injected (or global) scheduler. */
export type TimerHandle = ReturnType<typeof setTimeout>;

/** Injected effects so the retry policy stays pure and unit-testable. */
export interface RetryDeps {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly sleep: (ms: number) => Promise<void>;
  /**
   * Schedules the per-attempt timeout. Defaults to the global `setTimeout`;
   * injected in tests so the abort path can be exercised without real timers.
   */
  readonly setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Cancels a pending {@link setTimer}. Defaults to the global `clearTimeout`. */
  readonly clearTimer?: (handle: TimerHandle) => void;
}

/**
 * Backoff schedule between retry attempts, in milliseconds. Length also
 * caps the number of retries (so total attempts = `length + 1`). Kept short
 * so a genuinely failing request still resolves well inside route-loading
 * and smoke timeouts.
 */
export const DEFAULT_RETRY_BACKOFFS_MS: readonly number[] = [120, 300, 700];

/**
 * Per-attempt timeout in milliseconds. Sized comfortably above healthy
 * response latency (sub-second in practice) yet below the ~30s cold-start
 * stall seen at deploy cutover, so a stalled attempt is aborted and retried
 * against the warmed node rather than hanging the UI. A non-positive value
 * disables the timeout guard entirely.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

/**
 * Decides whether a request method is safe to retry. Only idempotent reads
 * (`GET`/`HEAD`) are retried so a transient failure can never double-apply a
 * mutation (`POST`/`PUT`/`PATCH`/`DELETE`).
 * @param method - HTTP method, defaulting to `GET` when unset.
 * @returns True when the request can be retried safely.
 */
export function isRetryableMethod(method: string | undefined): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

/**
 * Builds the abort reason used when an attempt exceeds its timeout. A distinct
 * `name` lets callers and tests tell a timeout apart from other failures.
 * @param path - Same-origin request path that timed out.
 * @param timeoutMs - Timeout window that elapsed.
 * @returns An `Error` carrying a `TimeoutError` name.
 */
function timeoutReason(path: string, timeoutMs: number): Error {
  return Object.assign(
    new Error(`request ${path} exceeded ${timeoutMs}ms timeout`),
    { name: "TimeoutError" }
  );
}

/**
 * Runs a single fetch attempt under a per-attempt timeout. If the request does
 * not settle within `timeoutMs`, the attempt is aborted and rejects with a
 * {@link timeoutReason}; any caller-provided `init.signal` is also honored so
 * external cancellation still propagates. A non-positive `timeoutMs` skips the
 * guard and fetches directly.
 * @param path - Same-origin request path.
 * @param init - Fetch options (already merged with defaults by the caller).
 * @param deps - Injected `fetch` + timer effects.
 * @param timeoutMs - Per-attempt timeout window.
 * @returns The fetch `Response` if it settles before the timeout.
 */
async function fetchWithTimeout(
  path: string,
  init: RequestInit,
  deps: RetryDeps,
  timeoutMs: number
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return deps.fetch(path, init);
  }

  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? (handle => clearTimeout(handle));
  const controller = new AbortController();
  const external = init.signal ?? undefined;
  const onExternalAbort = (): void => controller.abort(external?.reason);

  if (external?.aborted) controller.abort(external.reason);
  else external?.addEventListener("abort", onExternalAbort, { once: true });

  const timer = setTimer(
    () => controller.abort(timeoutReason(path, timeoutMs)),
    timeoutMs
  );
  try {
    return await deps.fetch(path, { ...init, signal: controller.signal });
  } finally {
    clearTimer(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Fetches a request, retrying idempotent calls when an attempt throws — either
 * the connection-reset signature or a per-attempt timeout (see module header).
 *
 * A response with any HTTP status — including error statuses — is returned on
 * the first attempt exactly as a bare `fetch` would; only thrown network
 * errors and timeouts on idempotent requests are retried.
 * @param path - Same-origin request path.
 * @param init - Fetch options (already merged with defaults by the caller).
 * @param retryable - Whether this request is safe to retry.
 * @param deps - Injected `fetch` + `sleep` (+ optional timer) effects.
 * @param backoffs - Remaining backoff schedule; controls remaining retries.
 * @param timeoutMs - Per-attempt timeout window.
 * @returns The fetch `Response` (possibly from a later attempt).
 */
export async function fetchWithRetry(
  path: string,
  init: RequestInit,
  retryable: boolean,
  deps: RetryDeps,
  backoffs: readonly number[] = DEFAULT_RETRY_BACKOFFS_MS,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  try {
    return await fetchWithTimeout(path, init, deps, timeoutMs);
  } catch (error) {
    if (retryable && backoffs.length > 0) {
      await deps.sleep(backoffs[0] ?? 0);
      return fetchWithRetry(
        path,
        init,
        retryable,
        deps,
        backoffs.slice(1),
        timeoutMs
      );
    }
    throw error;
  }
}
