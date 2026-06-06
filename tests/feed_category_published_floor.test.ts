/**
 * Regression test for the recurring deploy-smoke failure where
 * `/Feed?category=<x>` returned HTTP 500 for every visitor.
 *
 * Root cause: every Article feed query sorts by `publishedDate`, and Harper
 * throws `SyntaxError: Invalid value for attribute publishedDate: "undefined"`
 * the moment a sorted result set contains a row with a missing `publishedDate`
 * (some ingested rows do, despite the schema). The unfiltered `"all"` path
 * used an indexed `publishedDate > epoch` condition that filtered those rows
 * out before the sort; the category-filtered path used only
 * `category equals <x>`, so the date-less rows stayed in and crashed the sort.
 *
 * In the smoke this surfaced indirectly: the feed-filter probe read the 500
 * body (no `items`) as "category is empty", picked a category that actually
 * had moves, and the "no posts match" empty state never rendered.
 *
 * The fix applies the `publishedDate > epoch` floor on the category path too.
 * This test pins it by simulating Harper's exact crash.
 */
import { beforeEach, describe, expect, it } from "vitest";

interface Condition {
  readonly attribute: string;
  readonly comparator?: string;
  readonly value?: unknown;
}

interface SearchQuery {
  readonly conditions?: readonly Condition[];
  readonly sort?: { readonly attribute: string };
  readonly limit?: number;
  readonly offset?: number;
}

const EPOCH_FLOOR = "1970-01-01";

/**
 * Reproduces Harper's sort-on-undefined crash: rows missing `publishedDate`
 * are only dropped by an explicit `publishedDate > <floor>` condition, and a
 * `publishedDate` sort over any surviving date-less row throws — exactly as
 * the deployed cluster does.
 * @param rows - Article-like rows matched by the query.
 * @param query - Harper-style search query.
 * @yields Matching rows, or throws to mimic the deployed crash.
 */
async function* articleSearch(
  rows: readonly Record<string, unknown>[],
  query?: SearchQuery
): AsyncGenerator<unknown> {
  const conditions = query?.conditions ?? [];
  const hasPublishedFloor = conditions.some(
    condition =>
      condition.attribute === "publishedDate" &&
      condition.comparator === "greater_than"
  );
  const categoryCondition = conditions.find(
    condition => condition.attribute === "category"
  );
  const matched = rows
    .filter(row =>
      categoryCondition ? row.category === categoryCondition.value : true
    )
    .filter(row => (hasPublishedFloor ? Boolean(row.publishedDate) : true));
  if (
    query?.sort?.attribute === "publishedDate" &&
    matched.some(row => row.publishedDate === undefined)
  ) {
    throw new SyntaxError(
      'Invalid value for attribute publishedDate: "undefined", expecting Date'
    );
  }
  yield* matched;
}

/**
 * Builds an Article-like table handle backed by {@link articleSearch}.
 * @param rows - Article rows physically present in the table.
 * @returns A table handle exposing a crash-faithful `search()` iterable.
 */
const articleTableLike = (rows: readonly Record<string, unknown>[]) => ({
  search: (query?: SearchQuery): AsyncGenerator<unknown> =>
    articleSearch(rows, query),
});

const ROWS: readonly Record<string, unknown>[] = [
  { id: "a1", category: "unknown", publishedDate: "2026-06-01" },
  { id: "a2", category: "unknown", publishedDate: undefined },
  { id: "a3", category: "firm_bio", publishedDate: "2026-05-20" },
];

describe("feedArticlePage with date-less Article rows present", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).tables = {
      Article: articleTableLike(ROWS),
    };
  });

  it("does not 500 when filtering a category that contains a date-less row", async () => {
    const { feedArticlePage } =
      await import("../src/harper/resource-directory-search-queries.js");

    const page = await feedArticlePage("unknown", 50, 0);

    // The date-less row is excluded (like the default feed); the valid one stays.
    expect(page.items.map(row => (row as { id: string }).id)).toEqual(["a1"]);
    expect(page.total).toBe(1);
  });

  it("guards the simulation: a category sort without the floor really crashes", async () => {
    const handle = (globalThis as Record<string, unknown>).tables as {
      readonly Article: {
        readonly search: (q?: SearchQuery) => AsyncIterable<unknown>;
      };
    };
    await expect(
      Array.fromAsync(
        handle.Article.search({
          conditions: [
            { attribute: "category", comparator: "equals", value: "unknown" },
          ],
          sort: { attribute: "publishedDate" },
        })
      )
    ).rejects.toThrow(/Invalid value for attribute publishedDate/u);
  });

  it("still serves the unfiltered feed with the floor applied", async () => {
    const { feedArticlePage } =
      await import("../src/harper/resource-directory-search-queries.js");

    const page = await feedArticlePage("all", 50, 0);

    expect(page.items.map(row => (row as { id: string }).id)).toEqual([
      "a1",
      "a3",
    ]);
    expect(EPOCH_FLOOR).toBe("1970-01-01");
  });
});
