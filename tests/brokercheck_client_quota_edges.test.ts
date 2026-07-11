import { afterEach, describe, expect, it, vi } from "vitest";

import { BrokerCheckClient } from "../src/lib/brokercheck.js";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("BrokerCheck client quota edges", () => {
  it("waits through quota before a direct request and records attempts", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "getRandomValues").mockImplementation(array => {
      const numbers = array as Uint32Array;
      numbers[0] = 0;
      return array;
    });
    const fetchMock = vi.fn(
      async () => new Response('{"ok":true}', { status: 200 })
    );
    globalThis.fetch = fetchMock;
    const client = new BrokerCheckClient({
      jitter: 0,
      rateSeconds: 0,
      timeoutMs: 5_000,
      ua: "quota-test",
      verbose: false,
    });

    const pendingRequest = client.getOnce("https://api.example.test/quota", 0);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(pendingRequest).resolves.toEqual({ ok: true });

    expect(client.requestCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/quota", {
      headers: { "User-Agent": "quota-test", Accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });
});
