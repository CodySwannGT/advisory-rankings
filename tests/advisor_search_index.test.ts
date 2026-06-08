import { describe, expect, it } from "vitest";

import { uid } from "../src/lib/ids.js";
import {
  createRestAdvisorSearchIndexHandle,
  reindexAdvisorTokens,
  type AdvisorSearchIndexHandle,
  type AdvisorSearchIndexRow,
} from "../src/lib/advisor-search-index.js";
import { type AdvisorRow } from "../src/lib/advisor-tokens.js";
import { type HarperREST } from "../src/lib/brokercheck-rest.js";

/**
 *
 */
interface TestHandle extends AdvisorSearchIndexHandle {
  readonly snapshot: () => readonly AdvisorSearchIndexRow[];
}

const advisor = (overrides: Partial<AdvisorRow> = {}): AdvisorRow => ({
  id: "advisor-1",
  legalName: "John Smith",
  firstName: "John",
  lastName: "Smith",
  preferredName: null,
  ...overrides,
});

/**
 * Test-only in-memory handle mocking the Harper IO surface. Production
 * code consumes the AdvisorSearchIndexHandle interface; this helper
 * mutates private Map instances to simulate storage state across calls.
 * @param initialAdvisors - Advisor rows that getAdvisor will resolve.
 * @param initialTokens - Pre-existing AdvisorSearchIndex rows.
 * @returns Handle plus a snapshot accessor for assertions.
 */
const makeHandle = (
  initialAdvisors: readonly AdvisorRow[] = [],
  initialTokens: readonly AdvisorSearchIndexRow[] = []
): TestHandle => {
  const advisorsById = new Map<string, AdvisorRow>(
    initialAdvisors.map(a => [a.id, a])
  );
  const tokensById = new Map<string, AdvisorSearchIndexRow>(
    initialTokens.map(t => [t.id, t])
  );
  return {
    getAdvisor: async (id: string) => advisorsById.get(id) ?? null,
    listTokensForAdvisor: async (advisorId: string) =>
      [...tokensById.values()].filter(t => t.advisorId === advisorId),
    upsertTokens: async (rows: readonly AdvisorSearchIndexRow[]) => {
      rows.forEach(r => tokensById.set(r.id, r));
    },
    deleteTokens: async (ids: readonly string[]) => {
      ids.forEach(id => tokensById.delete(id));
    },
    snapshot: () =>
      [...tokensById.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
};

const makeRest = (
  overrides: Partial<Pick<HarperREST, "delete" | "get" | "put">>
): HarperREST =>
  ({
    delete: async () => true,
    get: async () => [],
    put: async () => true,
    ...overrides,
  }) as HarperREST;

describe("reindexAdvisorTokens", () => {
  it("returns zero counts for an empty input list", async () => {
    const handle = makeHandle();
    const summary = await reindexAdvisorTokens(handle, []);
    expect(summary).toEqual({ added: 0, removed: 0 });
    expect(handle.snapshot()).toEqual([]);
  });

  it("indexes a new advisor on first run — every desired token added, none removed", async () => {
    const handle = makeHandle([advisor()]);
    const summary = await reindexAdvisorTokens(handle, ["advisor-1"]);
    expect(summary.removed).toBe(0);
    expect(summary.added).toBeGreaterThan(0);
    const stored = handle.snapshot();
    expect(stored.length).toBe(summary.added);
    expect(stored.every(r => r.advisorId === "advisor-1")).toBe(true);
  });

  it("is idempotent on a stable Advisor row — second run produces zero adds and zero removes", async () => {
    const handle = makeHandle([advisor()]);
    await reindexAdvisorTokens(handle, ["advisor-1"]);
    const before = handle.snapshot();
    const summary = await reindexAdvisorTokens(handle, ["advisor-1"]);
    expect(summary).toEqual({ added: 0, removed: 0 });
    expect(handle.snapshot()).toEqual(before);
  });

  it("removes stale tokens and adds new ones when an advisor's name changes", async () => {
    const handle = makeHandle([advisor()]);
    await reindexAdvisorTokens(handle, ["advisor-1"]);
    const before = handle.snapshot();

    const renamed = advisor({
      legalName: "Jane Doe",
      firstName: "Jane",
      lastName: "Doe",
    });
    const renamedHandle = makeHandle([renamed], before);
    const summary = await reindexAdvisorTokens(renamedHandle, ["advisor-1"]);
    expect(summary.added).toBeGreaterThan(0);
    expect(summary.removed).toBeGreaterThan(0);
    const after = renamedHandle.snapshot();
    expect(after.every(r => !r.token.includes("smith"))).toBe(true);
    expect(after.some(r => r.token === "doe")).toBe(true);
  });

  it("indexes multiple advisors in a single batch", async () => {
    const handle = makeHandle([
      advisor({
        id: "a-1",
        legalName: "Alice Adams",
        firstName: "Alice",
        lastName: "Adams",
      }),
      advisor({
        id: "a-2",
        legalName: "Bob Baker",
        firstName: "Bob",
        lastName: "Baker",
      }),
    ]);
    const summary = await reindexAdvisorTokens(handle, ["a-1", "a-2"]);
    expect(summary.removed).toBe(0);
    expect(summary.added).toBeGreaterThan(0);
    const stored = handle.snapshot();
    expect(stored.some(r => r.advisorId === "a-1")).toBe(true);
    expect(stored.some(r => r.advisorId === "a-2")).toBe(true);
  });

  it("derives a deterministic uid stable across identical inputs", async () => {
    const a = makeHandle([advisor()]);
    const b = makeHandle([advisor()]);
    await reindexAdvisorTokens(a, ["advisor-1"]);
    await reindexAdvisorTokens(b, ["advisor-1"]);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("uses uid(ASI:advisorId:kind:token) for row ids", async () => {
    const handle = makeHandle([advisor()]);
    await reindexAdvisorTokens(handle, ["advisor-1"]);
    const expectedId = uid("ASI:advisor-1:lastName:smith");
    expect(handle.snapshot().some(r => r.id === expectedId)).toBe(true);
  });

  it("deletes all tokens for an advisor whose row is no longer loadable (orphan cleanup)", async () => {
    const orphanedToken: AdvisorSearchIndexRow = {
      id: uid("ASI:advisor-gone:lastName:smith"),
      advisorId: "advisor-gone",
      token: "smith",
      kind: "lastName",
    };
    const handle = makeHandle([], [orphanedToken]);
    const summary = await reindexAdvisorTokens(handle, ["advisor-gone"]);
    expect(summary.added).toBe(0);
    expect(summary.removed).toBe(1);
    expect(handle.snapshot()).toEqual([]);
  });
});

describe("createRestAdvisorSearchIndexHandle", () => {
  it("narrows REST advisor and token payloads before returning rows", async () => {
    const handle = createRestAdvisorSearchIndexHandle(
      makeRest({
        get: async path =>
          path === "/Advisor/"
            ? [
                {
                  id: "advisor-1",
                  legalName: "Ada Lovelace",
                  firstName: "Ada",
                  lastName: "Lovelace",
                  preferredName: 42,
                },
              ]
            : [
                {
                  id: "token-1",
                  advisorId: "advisor-1",
                  token: "ada",
                  kind: "firstName",
                },
              ],
      })
    );

    await expect(handle.getAdvisor("advisor-1")).resolves.toEqual({
      id: "advisor-1",
      legalName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      preferredName: null,
    });
    await expect(handle.listTokensForAdvisor("advisor-1")).resolves.toEqual([
      {
        id: "token-1",
        advisorId: "advisor-1",
        token: "ada",
        kind: "firstName",
      },
    ]);
  });

  it("treats non-array REST payloads as missing rows", async () => {
    const handle = createRestAdvisorSearchIndexHandle(
      makeRest({ get: async () => ({ id: "advisor-1" }) })
    );

    await expect(handle.getAdvisor("advisor-1")).resolves.toBeNull();
    await expect(handle.listTokensForAdvisor("advisor-1")).resolves.toEqual([]);
  });

  it("does not call REST writes for empty batches", async () => {
    const calls: string[] = [];
    const handle = createRestAdvisorSearchIndexHandle(
      makeRest({
        delete: async () => {
          calls.push("delete");
          return true;
        },
        put: async () => {
          calls.push("put");
          return true;
        },
      })
    );

    await handle.upsertTokens([]);
    await handle.deleteTokens([]);

    expect(calls).toEqual([]);
  });

  it("throws when any REST token upsert fails", async () => {
    const handle = createRestAdvisorSearchIndexHandle(
      makeRest({ put: async () => false })
    );

    await expect(
      handle.upsertTokens([
        {
          id: "token-1",
          advisorId: "advisor-1",
          token: "ada",
          kind: "firstName",
        },
      ])
    ).rejects.toThrow(
      "advisor-search-index: 1/1 AdvisorSearchIndex PUTs failed"
    );
  });

  it("throws when any REST token delete fails", async () => {
    const handle = createRestAdvisorSearchIndexHandle(
      makeRest({ delete: async () => false })
    );

    await expect(handle.deleteTokens(["token-1"])).rejects.toThrow(
      "advisor-search-index: 1/1 AdvisorSearchIndex DELETEs failed"
    );
  });
});
