/**
 * Regression guard for issue #721 acceptance criteria #1 and #2:
 *
 *   AC #1: `/PublicAdvisors` page requests must not iterate the whole
 *          Advisor table — every call must carry an explicit `limit`
 *          (and `offset` + `sort` when needed) so Harper's btree-backed
 *          paginated search returns at most page-size rows per call.
 *
 *   AC #2: `/Search` requests with a `q` must NOT call `tables.Advisor`
 *          at all when the token index resolves to an empty intersection
 *          (the legacy `allRows<AdvisorRow>(tables.Advisor)` path was
 *          the regression this issue exists to eliminate).
 *
 * The architecture spec at `.claude/scratch/issue-721-architecture.md`
 * §5.1 documents the bounded read-path plan; this test stubs
 * `tables.Advisor.search` with a call recorder and asserts the calls
 * never request more than the page-size cap and that empty token
 * intersections short-circuit the hydration step entirely.
 *
 * NOTE on coupling: this test deliberately interrogates HOW the
 * bundle calls `tables.Advisor.search` — not just what it returns.
 * That's the only way to lock in the bounded-search invariant; a
 * future change that re-introduces an `allRows()` call would still
 * return the correct page (because the test fixture is small) and
 * the only durable test signal is the call recorder.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { tokensForAdvisor } from "../src/lib/advisor-tokens.js";
import { advisorSearchIndexId } from "../src/lib/advisor-search-index.js";

/**
 *
 */
class Resource {
  /**
   * Matches the harper Resource shim.
   * @returns Null context.
   */
  getContext() {
    return null;
  }
}

(globalThis as any).Resource = Resource;

/** Page-size cap mirroring `resource-pagination.ts:MAX_LIMIT`. */
const MAX_PAGE_LIMIT = 100;

/**
 *
 */
interface RecordedSearchCall {
  readonly conditions: readonly unknown[];
  readonly limit: number | undefined;
  readonly offset: number | undefined;
  readonly sort: unknown;
}

/**
 *
 */
interface RecordedTable {
  readonly calls: RecordedSearchCall[];
  readonly search: (query?: any) => AsyncIterable<unknown>;
}

const recordedTable = (rows: readonly any[]): RecordedTable => {
  const calls: RecordedSearchCall[] = [];
  return {
    calls,
    search: (query?: any) => {
      const conditions = Array.isArray(query?.conditions)
        ? query.conditions
        : [];
      calls.push({
        conditions,
        limit: typeof query?.limit === "number" ? query.limit : undefined,
        offset: typeof query?.offset === "number" ? query.offset : undefined,
        sort: query?.sort,
      });
      const filtered = rows.filter(row =>
        conditions.every((c: any) => {
          const candidate = row?.[c.attribute];
          const cmp = c.comparator ?? "equals";
          if (cmp === "starts_with")
            return (
              typeof candidate === "string" &&
              candidate.startsWith(String(c.value))
            );
          if (cmp === "ne" || cmp === "not_equal") return candidate !== c.value;
          if (cmp === "greater_than" || cmp === "greater_than_equal")
            return candidate != null && candidate > c.value;
          return candidate === c.value;
        })
      );
      const sorted = query?.sort
        ? [...filtered].sort((a, b) =>
            a[query.sort.attribute] < b[query.sort.attribute] ? -1 : 1
          )
        : filtered;
      const offset = typeof query?.offset === "number" ? query.offset : 0;
      const limit =
        typeof query?.limit === "number" ? query.limit : sorted.length;
      return (async function* () {
        for (const row of sorted.slice(offset, offset + limit)) yield row;
      })();
    },
  };
};

const tableRows = new Map<string, any[]>();

const passthroughTable = (name: string) => ({
  search: (query?: any) => {
    const rows = tableRows.get(name) ?? [];
    const conditions = Array.isArray(query?.conditions) ? query.conditions : [];
    const filtered = rows.filter(row =>
      conditions.every((c: any) => {
        const candidate = row?.[c.attribute];
        const cmp = c.comparator ?? "equals";
        if (cmp === "starts_with")
          return (
            typeof candidate === "string" &&
            candidate.startsWith(String(c.value))
          );
        if (cmp === "ne" || cmp === "not_equal") return candidate !== c.value;
        if (cmp === "greater_than" || cmp === "greater_than_equal")
          return candidate != null && candidate > c.value;
        return candidate === c.value;
      })
    );
    const sorted = query?.sort
      ? [...filtered].sort((a, b) =>
          a[query.sort.attribute] < b[query.sort.attribute] ? -1 : 1
        )
      : filtered;
    const offset = typeof query?.offset === "number" ? query.offset : 0;
    const limit =
      typeof query?.limit === "number" ? query.limit : sorted.length;
    return (async function* () {
      for (const row of sorted.slice(offset, offset + limit)) yield row;
    })();
  },
});

(globalThis as any).tables = {
  Advisor: passthroughTable("Advisor"),
  AdvisorSearchIndex: passthroughTable("AdvisorSearchIndex"),
  Article: passthroughTable("Article"),
  ArticleAdvisorMention: passthroughTable("ArticleAdvisorMention"),
  ArticleDisclosureMention: passthroughTable("ArticleDisclosureMention"),
  ArticleFirmMention: passthroughTable("ArticleFirmMention"),
  ArticleTeamMention: passthroughTable("ArticleTeamMention"),
  ArticleTransitionEventMention: passthroughTable(
    "ArticleTransitionEventMention"
  ),
  EmploymentHistory: passthroughTable("EmploymentHistory"),
  Firm: passthroughTable("Firm"),
  FirmAlias: passthroughTable("FirmAlias"),
  Team: passthroughTable("Team"),
};

const resources = await import("../src/harper/resources.js");

const rebuildAdvisorSearchIndex = (rows: readonly any[]) => {
  const tokenRows = rows.flatMap((advisor: any) =>
    tokensForAdvisor(advisor as any).map(({ token, kind }) => ({
      id: advisorSearchIndexId(advisor.id, kind, token),
      advisorId: advisor.id,
      token,
      kind,
    }))
  );
  tableRows.set("AdvisorSearchIndex", [...tokenRows]);
};

const setAdvisorRows = (rows: readonly any[]) => {
  tableRows.set("Advisor", [...rows]);
  rebuildAdvisorSearchIndex(rows);
};

const routeTarget = (params: Record<string, string> = {}) => ({
  id: "",
  get: (name: string) => params[name] ?? null,
  getAll: (name: string) =>
    params[name] == null ? [] : ([params[name]] as readonly string[]),
  toString: () => "",
});

const seedAdvisors = (count: number): readonly any[] =>
  Array.from({ length: count }, (_unused, idx) => ({
    id: `advisor-${String(idx).padStart(4, "0")}`,
    firstName: `First${idx}`,
    lastName: `Last${String(idx).padStart(4, "0")}`,
    legalName: `First${idx} Last${String(idx).padStart(4, "0")}`,
    careerStatus: idx % 3 === 0 ? "retired" : "active",
    finraCrd: `${1000000 + idx}`,
  }));

describe("issue #721 — AC #1: /PublicAdvisors page is bounded", () => {
  beforeEach(() => {
    tableRows.clear();
  });

  it("never asks Advisor.search for more than page-size rows", async () => {
    const rows = seedAdvisors(250);
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      const page = await new (resources as any).PublicAdvisors().get(
        routeTarget({ limit: "20" })
      );

      expect(page.items.length).toBe(20);
      expect(page.total).toBe(250);
      // Every Advisor.search call must carry an explicit limit, and
      // that limit must never exceed the response cap (100).
      for (const call of recorded.calls) {
        if (call.limit === undefined) continue; // the count companion is allowed
        expect(call.limit).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
      }
      // There must be at least one bounded page call. If a future
      // regression removed `limit` from every call, this asserts.
      const boundedCalls = recorded.calls.filter(
        c => typeof c.limit === "number"
      );
      expect(boundedCalls.length).toBeGreaterThan(0);
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });

  it("issues a paginated Harper search (sort + limit + offset) for the unfiltered directory", async () => {
    const rows = seedAdvisors(80);
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      await new (resources as any).PublicAdvisors().get(
        routeTarget({ limit: "10" })
      );

      const pageCall = recorded.calls.find(
        c =>
          typeof c.limit === "number" &&
          c.sort &&
          (c.sort as any).attribute === "lastName"
      );
      expect(pageCall).toBeDefined();
      expect(pageCall!.limit).toBe(10);
      expect(pageCall!.offset).toBe(0);
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });

  it("bounds derived readiness finder scans with explicit page limits", async () => {
    const rows = seedAdvisors(250).map(row => ({
      ...row,
      bioText: "Ready profile",
      businessEmail: `${row.id}@example.com`,
      businessPhone: "555-0100",
      headshotUrl: "https://example.com/headshot.jpg",
      linkedinUrl: "https://www.linkedin.com/in/example",
    }));
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      const page = await new (resources as any).PublicAdvisors().get(
        routeTarget({ contactReadiness: "ready", limit: "10" })
      );

      expect(page.items.length).toBe(10);
      expect(page.nextCursor).not.toBeNull();
      expect(page.total).toBe(11);
      expect(page.truncated).toBe(true);
      for (const call of recorded.calls) {
        expect(call.limit).toBeDefined();
        expect(call.limit).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
      }
      expect(recorded.calls.map(call => call.offset)).toEqual([0]);
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });

  it("keeps sparse CRD-ready finder scans bounded by indexed CRD search", async () => {
    const rows = seedAdvisors(250).map((row, index) => ({
      ...row,
      bioText: index > 220 ? "Ready profile" : null,
      businessEmail: index > 220 ? `${row.id}@example.com` : null,
      businessPhone: index > 220 ? "555-0100" : null,
      finraCrd: index % 3 === 0 ? null : row.finraCrd,
      headshotUrl: index > 220 ? "https://example.com/headshot.jpg" : null,
      linkedinUrl: index > 220 ? "https://www.linkedin.com/in/example" : null,
    }));
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      const page = await new (resources as any).PublicAdvisors().get(
        routeTarget({
          contactReadiness: "ready",
          hasCrd: "true",
          limit: "2",
          profileSubstance: "present",
        })
      );

      expect(page.items).toHaveLength(2);
      expect(page.items.every((advisor: any) => advisor.hasCrd)).toBe(true);
      expect(page.nextCursor).not.toBeNull();
      for (const call of recorded.calls) {
        expect(call.limit).toBeDefined();
        expect(call.limit).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
        expect(
          call.conditions.some(
            (condition: any) => condition.attribute === "finraCrd"
          )
        ).toBe(true);
        expect(call.sort).toBeUndefined();
      }
      expect(recorded.calls.map(call => call.offset)).toEqual([0, 100]);
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });
});

describe("issue #721 — AC #2: /Search is token-index-bounded", () => {
  beforeEach(() => {
    tableRows.clear();
  });

  it("never calls Advisor.search when the token intersection is empty", async () => {
    const rows = seedAdvisors(50);
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      const result = await new (resources as any).Search().get(
        routeTarget({ q: "zzznomatch", limit: "10" })
      );

      // No matching tokens → no advisor hydration at all.
      expect(result.items.filter((i: any) => i.kind === "advisor")).toEqual([]);
      // The Advisor table must not have been touched.
      expect(recorded.calls).toEqual([]);
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });

  it("only hydrates the token-intersected advisor ids — not the full table", async () => {
    const rows = seedAdvisors(100);
    setAdvisorRows(rows);
    const recorded = recordedTable(rows);
    const originalAdvisor = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = recorded;

    try {
      // The token for advisor-0042 starts with `last0042` (lowercased
      // by the normalizer). q=`last0042` should hit exactly that one
      // token row and hydrate exactly one advisor — even though there
      // are 100 advisors in the fixture.
      const result = await new (resources as any).Search().get(
        routeTarget({ q: "last0042", limit: "10" })
      );

      const advisors = result.items.filter((i: any) => i.kind === "advisor");
      expect(advisors.length).toBe(1);
      expect(advisors[0].id).toBe("advisor-0042");

      // The Advisor.search calls used to hydrate must each be bounded
      // (`limit` present OR `equals id=<single>`).
      for (const call of recorded.calls) {
        const isBoundedById = call.conditions.some(
          (c: any) => c.attribute === "id" && c.comparator !== "starts_with"
        );
        const isBoundedByLimit = typeof call.limit === "number";
        expect(isBoundedById || isBoundedByLimit).toBe(true);
      }
    } finally {
      (globalThis as any).tables.Advisor = originalAdvisor;
    }
  });
});
