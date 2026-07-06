import { beforeEach, describe, expect, it } from "vitest";

import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from "../src/harper/resource-login-throttle.js";

const USER = "user@example.com";
const T0 = 1_000;

/**
 * Records `count` consecutive failures for `username` at time {@link T0}.
 * @param username Account key to fail.
 * @param count Number of failures to record.
 */
function failTimes(username: string, count: number): void {
  for (let attempt = 0; attempt < count; attempt += 1) {
    recordLoginFailure(username, T0);
  }
}

describe("login throttle", () => {
  beforeEach(() => {
    resetLoginThrottle();
  });

  it("permits the first five failures without locking", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => assertLoginAllowed(USER, T0)).not.toThrow();
      recordLoginFailure(USER, T0);
    }
  });

  it("locks with a 429 after the free attempts are burned", () => {
    failTimes(USER, 6);
    expect(() => assertLoginAllowed(USER, T0 + 500)).toThrow(
      expect.objectContaining({ status: 429, statusCode: 429 })
    );
  });

  it("expires the lock window as time advances", () => {
    failTimes(USER, 6);
    // 6th failure => excess 1 => 2000ms lock from T0.
    expect(() => assertLoginAllowed(USER, T0 + 2_500)).not.toThrow();
  });

  it("is per-account: one locked user does not lock another", () => {
    failTimes("locked@example.com", 6);
    expect(() => assertLoginAllowed("locked@example.com", T0 + 500)).toThrow();
    expect(() =>
      assertLoginAllowed("other@example.com", T0 + 500)
    ).not.toThrow();
  });

  it("clears failures on a successful login", () => {
    failTimes(USER, 6);
    recordLoginSuccess(USER);
    expect(() => assertLoginAllowed(USER, T0 + 500)).not.toThrow();
  });

  it("treats usernames case-insensitively", () => {
    failTimes("User@Example.com", 6);
    expect(() => assertLoginAllowed(USER, T0 + 500)).toThrow();
  });
});
