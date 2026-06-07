import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_BACKOFFS_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithRetry,
  isRetryableMethod,
} from "../src/web/api-retry.js";

/** Error text used by the simulated connection-reset rejections. */
const RESET_MESSAGE = "Failed to fetch";

/**
 * No-op sleep so retries resolve synchronously in tests.
 * @returns A resolved promise.
 */
const noSleep = (): Promise<void> => Promise.resolve();

/**
 * A timer that fires its callback immediately, so the per-attempt timeout
 * aborts the in-flight fetch synchronously without real wall-clock delay.
 * @param fn - Timeout callback.
 * @returns A no-op handle.
 */
const fireNow = (fn: () => void): ReturnType<typeof setTimeout> => {
  fn();
  return 0 as unknown as ReturnType<typeof setTimeout>;
};

/**
 * A timer that never fires, so a fetch that settles on its own is never
 * aborted by the timeout guard.
 * @returns A no-op handle.
 */
const neverFire = (): ReturnType<typeof setTimeout> =>
  0 as unknown as ReturnType<typeof setTimeout>;

/**
 * Fetch stand-in that hangs until its abort signal fires, then rejects with
 * the signal's reason — mirroring how the platform `fetch` honors an abort.
 * @param _input - Ignored request path.
 * @param init - Request options carrying the abort signal.
 * @returns A promise that rejects when the signal aborts.
 */
const fetchUntilAborted: RetryFetch = (_input, init) => {
  const signal = init?.signal;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
};

/**
 * Builds a minimal `Response`-like object carrying just the fields the
 * retry policy inspects.
 * @param status - HTTP status code to expose.
 * @returns A stand-in response with `status` and `ok`.
 */
const responseWith = (status: number): Response =>
  ({ status, ok: status >= 200 && status < 300 }) as Response;

describe("isRetryableMethod", () => {
  it("treats GET/HEAD (and unset) as retryable", () => {
    expect(isRetryableMethod(undefined)).toBe(true);
    expect(isRetryableMethod("GET")).toBe(true);
    expect(isRetryableMethod("get")).toBe(true);
    expect(isRetryableMethod("HEAD")).toBe(true);
  });

  it("treats mutations as non-retryable", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isRetryableMethod(method)).toBe(false);
    }
  });
});

describe("fetchWithRetry", () => {
  it("retries idempotent requests on a thrown connection reset, then succeeds", async () => {
    const fetchMock = vi
      .fn<RetryFetch>()
      .mockRejectedValueOnce(new TypeError(RESET_MESSAGE))
      .mockResolvedValueOnce(responseWith(200));

    const res = await fetchWithRetry("/Feed", {}, true, {
      fetch: fetchMock,
      sleep: noSleep,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an HTTP error status — only thrown errors", async () => {
    // A returned error response (e.g. a server 503) is surfaced as-is so the
    // existing manual-retry UI and deterministic 404 handling are unchanged.
    for (const status of [404, 503]) {
      const fetchMock = vi
        .fn<RetryFetch>()
        .mockResolvedValue(responseWith(status));

      const res = await fetchWithRetry("/Feed", {}, true, {
        fetch: fetchMock,
        sleep: noSleep,
      });

      expect(res.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("never retries non-idempotent requests, even on a thrown error", async () => {
    const fetchMock = vi
      .fn<RetryFetch>()
      .mockRejectedValue(new TypeError(RESET_MESSAGE));

    await expect(
      fetchWithRetry("/Watchlist", { method: "POST" }, false, {
        fetch: fetchMock,
        sleep: noSleep,
      })
    ).rejects.toThrow(RESET_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the backoff schedule is exhausted and rethrows", async () => {
    const fetchMock = vi
      .fn<RetryFetch>()
      .mockRejectedValue(new TypeError(RESET_MESSAGE));

    await expect(
      fetchWithRetry("/Feed", {}, true, { fetch: fetchMock, sleep: noSleep })
    ).rejects.toThrow(RESET_MESSAGE);
    // 1 initial attempt + one per backoff entry.
    expect(fetchMock).toHaveBeenCalledTimes(
      DEFAULT_RETRY_BACKOFFS_MS.length + 1
    );
  });

  it("aborts a stalled attempt on timeout and retries against a warmed node", async () => {
    // First attempt hangs (cold deploy-cutover node) and is aborted by the
    // per-attempt timeout; the retry lands on a healthy node and succeeds.
    const fetchMock = vi
      .fn<RetryFetch>()
      .mockImplementationOnce(fetchUntilAborted)
      .mockResolvedValueOnce(responseWith(200));

    const res = await fetchWithRetry("/Feed", {}, true, {
      fetch: fetchMock,
      sleep: noSleep,
      setTimer: fireNow,
      clearTimer: () => undefined,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a TimeoutError once retries are exhausted", async () => {
    const fetchMock = vi.fn<RetryFetch>().mockImplementation(fetchUntilAborted);

    await expect(
      fetchWithRetry("/Feed", {}, true, {
        fetch: fetchMock,
        sleep: noSleep,
        setTimer: fireNow,
        clearTimer: () => undefined,
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).toHaveBeenCalledTimes(
      DEFAULT_RETRY_BACKOFFS_MS.length + 1
    );
  });

  it("does not abort a fetch that settles before the timeout fires", async () => {
    const fetchMock = vi.fn<RetryFetch>().mockResolvedValue(responseWith(200));

    const res = await fetchWithRetry("/Feed", {}, true, {
      fetch: fetchMock,
      sleep: noSleep,
      setTimer: neverFire,
      clearTimer: () => undefined,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries a non-idempotent request that times out", async () => {
    const fetchMock = vi.fn<RetryFetch>().mockImplementation(fetchUntilAborted);

    await expect(
      fetchWithRetry("/Watchlist", { method: "POST" }, false, {
        fetch: fetchMock,
        sleep: noSleep,
        setTimer: fireNow,
        clearTimer: () => undefined,
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips the timeout guard when the window is non-positive", async () => {
    const fetchMock = vi.fn<RetryFetch>().mockResolvedValue(responseWith(200));
    // setTimer must never be consulted when the guard is disabled.
    const setTimer = vi.fn(neverFire);

    const res = await fetchWithRetry(
      "/Feed",
      {},
      true,
      {
        fetch: fetchMock,
        sleep: noSleep,
        setTimer,
        clearTimer: () => undefined,
      },
      DEFAULT_RETRY_BACKOFFS_MS,
      0
    );

    expect(res.status).toBe(200);
    expect(setTimer).not.toHaveBeenCalled();
  });

  it("exposes a positive default per-attempt timeout", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

/** Local alias for the injected fetch signature used by the mocks. */
type RetryFetch = (input: string, init?: RequestInit) => Promise<Response>;
