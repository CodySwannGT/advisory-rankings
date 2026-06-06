// Transient-failure retry for same-origin resource fetches.
//
// The shared Fabric dev serving node intermittently resets connections
// (`net::ERR_CONNECTION_RESET`) under the browser's concurrent request
// bursts. A single un-retried reset on a resource fetch (e.g. `/Feed` during
// a feed-filter change) surfaces `fetch` as a thrown `TypeError` and leaves a
// dead-end error card, which repeatedly broke the deploy smoke gate. Retrying
// *idempotent* requests a few times with backoff absorbs those blips.
//
// Scope is deliberately narrow: only thrown fetch errors (the observed reset
// signature) are retried. A request that completes with an HTTP error status
// is returned as-is so deterministic failures (404s) and the existing
// manual-retry UI for server error responses keep their current behavior.
// See docs/fabric-runbook.md §6.

/** Injected effects so the retry policy stays pure and unit-testable. */
export interface RetryDeps {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly sleep: (ms: number) => Promise<void>;
}

/**
 * Backoff schedule between retry attempts, in milliseconds. Length also
 * caps the number of retries (so total attempts = `length + 1`). Kept short
 * so a genuinely failing request still resolves well inside route-loading
 * and smoke timeouts.
 */
export const DEFAULT_RETRY_BACKOFFS_MS: readonly number[] = [120, 300, 700];

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
 * Fetches a request, retrying idempotent calls when `fetch` itself throws
 * (the connection-reset signature).
 *
 * A response with any HTTP status — including error statuses — is returned on
 * the first attempt exactly as a bare `fetch` would; only thrown network
 * errors on idempotent requests are retried.
 * @param path - Same-origin request path.
 * @param init - Fetch options (already merged with defaults by the caller).
 * @param retryable - Whether this request is safe to retry.
 * @param deps - Injected `fetch` + `sleep` effects.
 * @param backoffs - Remaining backoff schedule; controls remaining retries.
 * @returns The fetch `Response` (possibly from a later attempt).
 */
export async function fetchWithRetry(
  path: string,
  init: RequestInit,
  retryable: boolean,
  deps: RetryDeps,
  backoffs: readonly number[] = DEFAULT_RETRY_BACKOFFS_MS
): Promise<Response> {
  try {
    return await deps.fetch(path, init);
  } catch (error) {
    if (retryable && backoffs.length > 0) {
      await deps.sleep(backoffs[0] ?? 0);
      return fetchWithRetry(path, init, retryable, deps, backoffs.slice(1));
    }
    throw error;
  }
}
