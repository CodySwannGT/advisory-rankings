import { describe, expect, it } from "vitest";

import {
  TOKEN_INTERSECTION_CAP,
  advisorIdsForToken,
  intersectTokenIdSets,
  searchAdvisorsByTokens,
} from "../src/harper/resource-advisor-token-query.js";
import type { AdvisorSearchIndexRow } from "../src/lib/advisor-search-index.js";

/**
 * In-memory `tables.AdvisorSearchIndex` stub that honors the single
 * `starts_with` condition on `token` the production code issues. Tests
 * pass the seed rows directly so each scenario is hermetic.
 * @param rows - AdvisorSearchIndex rows for the test.
 * @returns Harper-shaped table handle suitable for the query helpers.
 */
const makeTokenTable = (rows: readonly AdvisorSearchIndexRow[]) => ({
  search: (query: Readonly<Record<string, unknown>>) =>
    (async function* () {
      const conditions = Array.isArray(
        (query as { readonly conditions?: unknown }).conditions
      )
        ? ((query as { readonly conditions: readonly unknown[] })
            .conditions as readonly Readonly<Record<string, unknown>>[])
        : [];
      for (const row of rows) {
        const matches = conditions.every(condition => {
          const attribute = String(condition.attribute);
          const comparator = String(condition.comparator ?? "equals");
          const candidate = (row as unknown as Record<string, unknown>)[
            attribute
          ];
          if (comparator === "starts_with") {
            return (
              typeof candidate === "string" &&
              candidate.startsWith(String(condition.value))
            );
          }
          return candidate === condition.value;
        });
        if (matches) yield row;
      }
    })(),
});

const tokenRow = (overrides: Partial<AdvisorSearchIndexRow>) => ({
  id: "asi-x",
  advisorId: "advisor-x",
  token: "x",
  kind: "name",
  ...overrides,
});

describe("intersectTokenIdSets", () => {
  it("returns empty when no token sets are provided", () => {
    expect(intersectTokenIdSets([])).toEqual({ ids: [], truncated: false });
  });

  it("returns the single set unchanged when only one token was searched", () => {
    const result = intersectTokenIdSets([new Set(["a", "b", "c"])]);
    expect(result.ids).toEqual(["a", "b", "c"]);
    expect(result.truncated).toBe(false);
  });

  it("intersects multiple sets keeping only ids in every set", () => {
    const result = intersectTokenIdSets([
      new Set(["a", "b", "c"]),
      new Set(["b", "c", "d"]),
      new Set(["c", "d", "e"]),
    ]);
    expect(new Set(result.ids)).toEqual(new Set(["c"]));
    expect(result.truncated).toBe(false);
  });

  it("returns empty (not truncated) when the intersection is empty", () => {
    const result = intersectTokenIdSets([new Set(["a"]), new Set(["b"])]);
    expect(result.ids).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("caps the result at TOKEN_INTERSECTION_CAP and reports truncated=true", () => {
    const big = new Set(
      Array.from({ length: TOKEN_INTERSECTION_CAP + 5 }, (_, i) => `id-${i}`)
    );
    const result = intersectTokenIdSets([big]);
    expect(result.ids.length).toBe(TOKEN_INTERSECTION_CAP);
    expect(result.truncated).toBe(true);
  });
});

describe("searchAdvisorsByTokens", () => {
  it("returns empty when q tokenizes to nothing (single char / whitespace)", async () => {
    const table = makeTokenTable([]);
    expect(await searchAdvisorsByTokens(table, "")).toEqual({
      ids: [],
      truncated: false,
    });
    expect(await searchAdvisorsByTokens(table, "  ")).toEqual({
      ids: [],
      truncated: false,
    });
    expect(await searchAdvisorsByTokens(table, "a")).toEqual({
      ids: [],
      truncated: false,
    });
  });

  it("matches advisors whose token starts with a single query token", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "mitchell" }),
      tokenRow({ id: "2", advisorId: "a-2", token: "milligan" }),
      tokenRow({ id: "3", advisorId: "a-3", token: "smith" }),
    ]);
    const result = await searchAdvisorsByTokens(table, "mit");
    expect(new Set(result.ids)).toEqual(new Set(["a-1"]));
  });

  it("intersects multiple query tokens against the index", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "john" }),
      tokenRow({ id: "2", advisorId: "a-1", token: "smith" }),
      tokenRow({ id: "3", advisorId: "a-2", token: "john" }),
      tokenRow({ id: "4", advisorId: "a-3", token: "smith" }),
    ]);
    const result = await searchAdvisorsByTokens(table, "john smith");
    expect(new Set(result.ids)).toEqual(new Set(["a-1"]));
  });

  it("dedupes when an advisor has multiple matching tokens for one query token", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "smith", kind: "lastName" }),
      tokenRow({ id: "2", advisorId: "a-1", token: "smith", kind: "name" }),
    ]);
    const result = await searchAdvisorsByTokens(table, "smith");
    expect(result.ids).toEqual(["a-1"]);
  });

  it("normalizes the query case-foldedly via NFD before lookup", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "jose" }),
    ]);
    const result = await searchAdvisorsByTokens(table, "José");
    expect(new Set(result.ids)).toEqual(new Set(["a-1"]));
  });
});

describe("advisorIdsForToken", () => {
  it("returns empty for tokens below the length floor", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "a" }),
    ]);
    expect(await advisorIdsForToken(table, "a")).toEqual([]);
  });

  it("returns matching advisor ids for a single normalized token", async () => {
    const table = makeTokenTable([
      tokenRow({ id: "1", advisorId: "a-1", token: "stone" }),
      tokenRow({ id: "2", advisorId: "a-2", token: "stonecastle" }),
      tokenRow({ id: "3", advisorId: "a-3", token: "blake" }),
    ]);
    const ids = await advisorIdsForToken(table, "stone");
    expect(new Set(ids)).toEqual(new Set(["a-1", "a-2"]));
  });
});
