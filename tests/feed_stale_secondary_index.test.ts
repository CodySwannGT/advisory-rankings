/**
 * Regression test for the recurring deploy-smoke failure where the
 * event-backed / recruiting / disclosure feed modes rendered empty on the
 * Fabric serving node.
 *
 * Root cause: on the shared Fabric dev cluster, replicated rows reach the
 * public-serving node (a full `search({})` sees them) but their secondary
 * indexes do NOT reliably replicate, so an indexed
 * `search({conditions:[{attribute:"articleId",…}]})` against that node
 * returns zero rows even though the row is present. After #771 swapped the
 * feed off `loadAll()` onto indexed `articleId` lookups, that silently
 * dropped every article→event-card join and broke the deploy smoke gate.
 *
 * The fix loads the tiny article→mention join tables with a full scan and
 * filters in memory, so the join no longer depends on Fabric secondary-index
 * replication. This test pins that behavior by simulating a table whose
 * `articleId`-conditioned search returns nothing while its full scan still
 * sees the rows — the exact serving-node failure mode.
 */
import { beforeEach, describe, expect, it } from "vitest";

interface Condition {
  readonly attribute: string;
  readonly value: unknown;
}

interface SearchQuery {
  readonly conditions?: readonly Condition[];
}

/**
 * Yields the rows a "stale secondary index" node would return for a query: a
 * full scan (no conditions) and a primary-key `id` lookup both work, but every
 * other indexed attribute (articleId, …) resolves to nothing — matching the
 * Fabric serving-node behavior.
 * @param rows - The rows physically present on the node.
 * @param query - Harper-style search query.
 * @yields Rows the stale-index node would surface for that query.
 */
async function* staleSecondaryIndexRows(
  rows: readonly Record<string, unknown>[],
  query?: SearchQuery
): AsyncGenerator<Record<string, unknown>> {
  const conditions = query?.conditions ?? [];
  if (conditions.length === 0) {
    yield* rows; // full scan: replicated rows are visible
    return;
  }
  const idCondition = conditions.find(
    condition => condition.attribute === "id"
  );
  // Primary-key lookups still work (the id index replicates fine); every other
  // indexed attribute (articleId, …) is stale → empty.
  yield* idCondition ? rows.filter(row => row.id === idCondition.value) : [];
}

/**
 * Builds a minimal Harper-style table handle backed by
 * {@link staleSecondaryIndexRows}.
 * @param rows - The rows physically present on the node.
 * @returns A table handle exposing a `search()` async iterable.
 */
const staleSecondaryIndexTable = (
  rows: readonly Record<string, unknown>[]
) => ({
  search: (query?: SearchQuery) => staleSecondaryIndexRows(rows, query),
});

const ARTICLE_ID = "article-1";

const seedTables = (): void => {
  (globalThis as Record<string, unknown>).tables = {
    ArticleAdvisorMention: staleSecondaryIndexTable([
      { id: "ma1", articleId: ARTICLE_ID, advisorId: "adv-1" },
    ]),
    ArticleFirmMention: staleSecondaryIndexTable([
      { id: "mf1", articleId: ARTICLE_ID, firmId: "firm-1" },
    ]),
    ArticleTeamMention: staleSecondaryIndexTable([]),
    ArticleTransitionEventMention: staleSecondaryIndexTable([
      { id: "mt1", articleId: ARTICLE_ID, transitionEventId: "te-1" },
    ]),
    ArticleDisclosureMention: staleSecondaryIndexTable([
      { id: "md1", articleId: ARTICLE_ID, disclosureId: "disc-1" },
    ]),
    TransitionEvent: staleSecondaryIndexTable([
      { id: "te-1", subjectAdvisorId: "adv-1", fromFirmId: "firm-1" },
    ]),
    Disclosure: staleSecondaryIndexTable([
      { id: "disc-1", advisorId: "adv-1" },
    ]),
    RecruitingDealQuote: staleSecondaryIndexTable([]),
    Advisor: staleSecondaryIndexTable([{ id: "adv-1", fullName: "Jane Doe" }]),
    Firm: staleSecondaryIndexTable([{ id: "firm-1", name: "Morgan Stanley" }]),
    Team: staleSecondaryIndexTable([]),
    EmploymentHistory: staleSecondaryIndexTable([]),
    TeamMetricSnapshot: staleSecondaryIndexTable([]),
    Sanction: staleSecondaryIndexTable([]),
  };
};

describe("feed hydration with a stale secondary index on the serving node", () => {
  beforeEach(seedTables);

  it("resolves article→mention joins via full scan, not the articleId index", async () => {
    const { loadFeedDbForArticles } =
      await import("../src/harper/resource-feed-page-load.js");

    const db = await loadFeedDbForArticles([{ id: ARTICLE_ID } as never]);

    // The join rows survive even though an articleId-conditioned search would
    // have returned nothing on this node.
    expect(db.mTE.map(row => row.id)).toContain("mt1");
    expect(db.mDisc.map(row => row.id)).toContain("md1");
    expect(db.mAdv.map(row => row.id)).toContain("ma1");
    expect(db.mFirm.map(row => row.id)).toContain("mf1");

    // And the event row those mentions point at is hydrated by primary key.
    expect(db.byTransition.get("te-1")).toBeTruthy();
    expect(db.byDisclosure.get("disc-1")).toBeTruthy();
  });

  it("guards the simulation: an articleId-conditioned search really is empty", async () => {
    const handle = (globalThis as Record<string, unknown>).tables as Record<
      string,
      { readonly search: (q?: SearchQuery) => AsyncIterable<unknown> }
    >;
    const collected: unknown[] = [];
    for await (const row of handle.ArticleTransitionEventMention.search({
      conditions: [{ attribute: "articleId", value: ARTICLE_ID }],
    })) {
      collected.push(row);
    }
    expect(collected).toHaveLength(0);
  });
});
