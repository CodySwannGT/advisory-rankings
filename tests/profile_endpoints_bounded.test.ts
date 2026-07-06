/**
 * Regression guard for the PR-A2 full-scan migration: the single-entity
 * profile endpoints (`/AdvisorProfile`, `/FirmProfile`, `/FirmAdvisors`,
 * `/TeamProfile`, `/ArticleView`) must no longer hydrate through the
 * request-wide `loadAll()` 34-table scan. On the id fast path, every
 * `search()` against the large tables (Advisor, EmploymentHistory,
 * Disclosure, TransitionEvent) must carry subject-scoped `conditions`
 * — an unconditioned `search({})` against those tables is exactly the
 * regression this suite exists to catch.
 *
 * Deliberate exceptions (documented in
 * `src/harper/resource-profile-scoped-load.ts`):
 *   - Firm / FirmAlias / Team / Article subject tables may be scanned
 *     for slug/alias resolution and alias-merge canonicalization.
 *   - The article→mention join tables and FieldAssertion are scanned
 *     because their secondary indexes do not replicate reliably on the
 *     Fabric serving node (see resource-feed-page-load.ts).
 *
 * NOTE on coupling: like tests/issue_721_directory_bounded.test.ts,
 * this test interrogates HOW the endpoints call `tables.X.search` —
 * a reintroduced full scan would still return correct payloads against
 * a small fixture, so the call recorder is the only durable signal.
 */
import { beforeEach, describe, expect, it } from "vitest";

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

interface RecordedSearchCall {
  readonly conditions: readonly any[];
  readonly limit: number | undefined;
  readonly sort: unknown;
}

const tableRows = new Map<string, any[]>();
const recordedCalls = new Map<string, RecordedSearchCall[]>();

const matchesCondition = (row: any, condition: any): boolean => {
  const candidate = row?.[condition.attribute];
  const comparator = condition.comparator ?? "equals";
  if (comparator === "starts_with")
    return (
      typeof candidate === "string" &&
      candidate.startsWith(String(condition.value))
    );
  if (comparator === "greater_than")
    return candidate != null && candidate > condition.value;
  return candidate === condition.value;
};

const recordingTable = (name: string) => ({
  search: (query?: any) => {
    const conditions = Array.isArray(query?.conditions) ? query.conditions : [];
    const calls = recordedCalls.get(name) ?? [];
    recordedCalls.set(name, [
      ...calls,
      {
        conditions,
        limit: typeof query?.limit === "number" ? query.limit : undefined,
        sort: query?.sort,
      },
    ]);
    const rows = (tableRows.get(name) ?? []).filter(row =>
      conditions.every((condition: any) => matchesCondition(row, condition))
    );
    return (async function* () {
      for (const row of rows) yield row;
    })();
  },
});

const TABLE_NAMES = [
  "Advisor",
  "AdvisorCorrectionRequest",
  "AdvisorMetricSnapshot",
  "AdvisorResearchCheck",
  "Article",
  "ArticleAdvisorMention",
  "ArticleDisclosureMention",
  "ArticleFirmMention",
  "ArticleTeamMention",
  "ArticleTransitionEventMention",
  "Branch",
  "BrokerCheckSnapshot",
  "Designation",
  "Disclosure",
  "Education",
  "EmploymentHistory",
  "FieldAssertion",
  "Firm",
  "FirmAlias",
  "License",
  "OutsideBusinessActivity",
  "Ranking",
  "RankingEntry",
  "RecruitingDealQuote",
  "RegistrationApplication",
  "RegulatoryDiscrepancy",
  "Sanction",
  "Team",
  "TeamMembership",
  "TeamMetricSnapshot",
  "TransitionEvent",
] as const;

(globalThis as any).tables = Object.fromEntries(
  TABLE_NAMES.map(name => [name, recordingTable(name)])
);

const resources = await import("../src/harper/resources.js");

const routeTarget = (id: string) => ({
  id,
  get: () => null,
  getAll: () => [],
  toString: () => id,
});

/** Tables whose every search call must carry subject-scoped conditions. */
const LARGE_TABLES = [
  "Advisor",
  "EmploymentHistory",
  "Disclosure",
  "TransitionEvent",
] as const;

const unconditionedCalls = (name: string): readonly RecordedSearchCall[] =>
  (recordedCalls.get(name) ?? []).filter(call => call.conditions.length === 0);

const seedFixture = () => {
  tableRows.set("Firm", [
    { id: "firm-a", name: "Example Wealth Management", channel: "regional_bd" },
  ]);
  tableRows.set("Advisor", [
    {
      id: "advisor-a",
      legalName: "Avery Stone",
      firstName: "Avery",
      lastName: "Stone",
    },
    {
      id: "advisor-b",
      legalName: "Blake Young",
      firstName: "Blake",
      lastName: "Young",
    },
  ]);
  tableRows.set("EmploymentHistory", [
    {
      id: "employment-a",
      advisorId: "advisor-a",
      firmId: "firm-a",
      startDate: "2020-01-01",
    },
    {
      id: "employment-b",
      advisorId: "advisor-b",
      firmId: "firm-a",
      startDate: "2021-01-01",
    },
  ]);
  tableRows.set("Team", [
    { id: "team-a", name: "Stone Group", currentFirmId: "firm-a" },
  ]);
  tableRows.set("TeamMembership", [
    {
      id: "membership-a",
      teamId: "team-a",
      advisorId: "advisor-a",
      role: "lead",
    },
  ]);
  tableRows.set("Article", [
    {
      id: "article-a",
      headline: "Stone joins Example",
      url: "https://example.test/a",
      publishedDate: "2024-01-01",
      category: "recruiting",
    },
  ]);
  tableRows.set("ArticleAdvisorMention", [
    { id: "mention-a", articleId: "article-a", advisorId: "advisor-a" },
  ]);
};

describe("profile endpoints issue only subject-scoped large-table reads", () => {
  beforeEach(() => {
    tableRows.clear();
    recordedCalls.clear();
    seedFixture();
  });

  it("AdvisorProfile by id never scans a large table unconditioned", async () => {
    const profile = await new (resources as any).AdvisorProfile().get(
      routeTarget("advisor-a")
    );

    expect(profile.advisor.id).toBe("advisor-a");
    expect(profile.career).toHaveLength(1);
    for (const name of LARGE_TABLES) {
      expect({ table: name, calls: unconditionedCalls(name) }).toEqual({
        table: name,
        calls: [],
      });
    }
    // The subject lookup itself must be an indexed primary-key search.
    const advisorCalls = recordedCalls.get("Advisor") ?? [];
    expect(advisorCalls.length).toBeGreaterThan(0);
    for (const call of advisorCalls) {
      expect(call.conditions.some((c: any) => c.attribute === "id")).toBe(true);
    }
  });

  it("AdvisorProfile still resolves slugs via the documented one-table fallback", async () => {
    const profile = await new (resources as any).AdvisorProfile().get(
      routeTarget("avery-stone")
    );

    expect(profile.advisor.id).toBe("advisor-a");
    // The slug fallback may scan Advisor (one table), but must not drag
    // the other large tables into unconditioned scans.
    for (const name of ["EmploymentHistory", "Disclosure", "TransitionEvent"]) {
      expect(unconditionedCalls(name)).toEqual([]);
    }
  });

  it("FirmProfile reads employments only through the firmId index", async () => {
    const profile = await new (resources as any).FirmProfile().get(
      routeTarget("firm-a")
    );

    expect(profile.firm.id).toBe("firm-a");
    expect(profile.currentAdvisorCount).toBe(2);
    for (const name of LARGE_TABLES) {
      expect(unconditionedCalls(name)).toEqual([]);
    }
    const employmentCalls = recordedCalls.get("EmploymentHistory") ?? [];
    expect(employmentCalls.length).toBeGreaterThan(0);
    for (const call of employmentCalls) {
      expect(call.conditions.some((c: any) => c.attribute === "firmId")).toBe(
        true
      );
    }
  });

  it("FirmAdvisors hydrates the roster without unconditioned scans", async () => {
    const page = await new (resources as any).FirmAdvisors().get(
      routeTarget("firm-a")
    );

    expect(page.items).toHaveLength(2);
    for (const name of LARGE_TABLES) {
      expect(unconditionedCalls(name)).toEqual([]);
    }
  });

  it("TeamProfile never touches EmploymentHistory and scopes member reads", async () => {
    const profile = await new (resources as any).TeamProfile().get(
      routeTarget("team-a")
    );

    expect(profile.team.id).toBe("team-a");
    expect(profile.currentMembers).toHaveLength(1);
    expect(recordedCalls.get("EmploymentHistory") ?? []).toEqual([]);
    for (const name of LARGE_TABLES) {
      expect(unconditionedCalls(name)).toEqual([]);
    }
  });

  it("ArticleView by id resolves the subject via primary key, not a scan", async () => {
    const detail = await new (resources as any).ArticleView().get(
      routeTarget("article-a")
    );

    expect(detail.article.id).toBe("article-a");
    expect(detail.advisors).toHaveLength(1);
    for (const name of LARGE_TABLES) {
      expect(unconditionedCalls(name)).toEqual([]);
    }
    const articleCalls = recordedCalls.get("Article") ?? [];
    for (const call of articleCalls) {
      expect(call.conditions.some((c: any) => c.attribute === "id")).toBe(true);
    }
  });
});
