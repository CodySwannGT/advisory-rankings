import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RETRY_BACKOFFS_MS,
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
});

/** Local alias for the injected fetch signature used by the mocks. */
type RetryFetch = (input: string, init?: RequestInit) => Promise<Response>;
