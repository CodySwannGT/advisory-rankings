import { describe, expect, it } from "vitest";

/**
 * Regression test for #999.
 *
 * Harper exposes table handles as class constructors, so `typeof tables.X` is
 * `"function"`, not `"object"`. The watchlist store's table guard previously
 * required `typeof === "object"` and therefore rejected every real, bound,
 * searchable table on the authenticated path, surfacing as
 * `500 "<Table> table is unavailable"`. Production used a function-typed handle
 * while the unit tests used an object-typed stub, so the bug shipped invisibly.
 *
 * These tests stub `tables` with a FUNCTION-typed handle (a class exposing a
 * static `search`), mirroring real Harper, and assert resolution succeeds.
 */

/** Async generator stand-in for Harper's `search`. */
async function* empty(): AsyncIterable<never> {
  // no rows
}

/** Class constructor that mimics a real Harper table handle (typeof === "function"). */
class FunctionTableHandle {
  static search(): AsyncIterable<never> {
    return empty();
  }
  static async get(): Promise<null> {
    return null;
  }
}

(globalThis as any).databases = {};

const { userListTable, userListEntryTable, rowsFor } =
  await import("../src/harper/resource-user-watchlists-store.js");

describe("watchlist store table guard (#999)", () => {
  it("accepts a function-typed (class) table handle, as Harper exposes it", () => {
    expect(() => userListTable(FunctionTableHandle)).not.toThrow();
    expect(() => userListEntryTable(FunctionTableHandle)).not.toThrow();
    expect(userListTable(FunctionTableHandle)).toBe(FunctionTableHandle);
  });

  it("still accepts a plain object-typed handle that exposes search", () => {
    const objectHandle = { search: () => empty() };
    expect(() => userListTable(objectHandle)).not.toThrow();
  });

  it("rejects a non-table value with the unavailable error", () => {
    expect(() => userListTable({})).toThrow(/table is unavailable/);
    expect(() => userListTable(null)).toThrow(/table is unavailable/);
  });

  it("a resolved function-typed handle is actually searchable", async () => {
    const resolved = userListTable(FunctionTableHandle);
    await expect(rowsFor(resolved, "userId", "nobody")).resolves.toEqual([]);
  });
});
