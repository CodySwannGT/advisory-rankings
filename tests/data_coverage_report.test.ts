import { describe, expect, it } from "vitest";
import { buildDataCoverageReport } from "../src/lib/data-coverage-report.js";
import { renderDataCoverageReport } from "../src/lib/data-coverage-render.js";

const numberFrom = (sql: string, fallback = 0): number => {
  const match = /COUNT\(\*\) AS n FROM data\.([A-Za-z]+)/.exec(sql);
  const value = match?.[1];
  return value ? (TABLE_COUNTS[value] ?? fallback) : fallback;
};

const TABLE_COUNTS: Record<string, number> = {
  Advisor: 2,
  Firm: 2,
  FirmAlias: 2,
  Branch: 2,
  Team: 1,
  TeamMembership: 1,
  Designation: 1,
  Article: 3,
  TransitionEvent: 4,
  ArticleTransitionEventMention: 5,
  FieldAssertion: 6,
  EmploymentHistory: 7,
  Disclosure: 8,
  AdvisorResearchCheck: 9,
};

const SPARSE_ADVISOR_LABEL = "Sparse Advisor";
const RECRUITING_GAP_HEADLINE = "Raymond James Snags $7M Team From RBC";
type SqlRow = Readonly<Record<string, unknown>>;

const QUERY_FIXTURES: ReadonlyArray<
  Readonly<{
    includes: ReadonlyArray<string>;
    rows: ReadonlyArray<SqlRow>;
  }>
> = [
  {
    includes: ["GROUP BY targetTable"],
    rows: [
      { label: "Advisor", n: 3 },
      { label: "TransitionEvent", n: 2 },
    ],
  },
  { includes: ["GROUP BY category"], rows: [{ label: "recruiting", n: 3 }] },
  {
    includes: ["COUNT(DISTINCT advisorId)"],
    rows: [{ label: "merrill_yext", n: 2 }],
  },
  {
    includes: ["COUNT(DISTINCT branchId)"],
    rows: [{ label: "merrill_yext", n: 1 }],
  },
  {
    includes: ["FROM data.FirmAlias"],
    rows: [{ label: "wells_fargo_advisors_html", n: 2 }],
  },
  { includes: ["MAX(checkedAt)"], rows: [{ latest: "2026-05-23" }] },
  {
    includes: ["FROM data.AdvisorResearchCheck"],
    rows: [{ label: "merrill_yext", n: 2 }],
  },
  {
    includes: ["FROM data.Advisor", "missing"],
    rows: [{ id: "adv-1", label: SPARSE_ADVISOR_LABEL, missing: 2 }],
  },
  {
    includes: ["FROM data.Firm", "missing"],
    rows: [{ id: "firm-1", label: "Sparse Firm", missing: 1 }],
  },
  {
    includes: ["transition_events"],
    rows: [
      { label: "transition_events", n: 4 },
      { label: "article_transition_mentions", n: 5 },
      { label: "transition_field_assertions", n: 2 },
    ],
  },
  { includes: ["MAX(publishedDate)"], rows: [{ latest: "2026-06-01" }] },
  { includes: ["MAX(moveDate)"], rows: [{ latest: "2026-05-20" }] },
  {
    includes: ["SELECT id, headline, category FROM data.Article"],
    rows: [
      {
        id: "a1",
        headline: RECRUITING_GAP_HEADLINE,
        category: "unknown",
      },
      { id: "a2", headline: "Quarterly Earnings Update", category: "unknown" },
      {
        id: "a3",
        headline: "Wells Fargo Recruits Advisor",
        category: "unknown",
      },
    ],
  },
  {
    includes: ["SELECT articleId FROM data.ArticleTransitionEventMention"],
    rows: [{ articleId: "a3" }],
  },
  { includes: ["IS NOT NULL"], rows: [{ n: 1 }] },
];

const mockCoverageQuery = async <T extends SqlRow>(
  query: string
): Promise<ReadonlyArray<T>> => {
  const fixture = QUERY_FIXTURES.find(({ includes }) =>
    includes.every(part => query.includes(part))
  );
  return (fixture?.rows ?? [{ n: numberFrom(query) }]) as ReadonlyArray<T>;
};

describe("data coverage report", () => {
  it("summarizes counts, completeness, recruiting coverage, and sparse rows", async () => {
    const report = await buildDataCoverageReport(mockCoverageQuery);

    expect(report.counts.Advisor).toBe(2);
    expect(report.counts.ArticleTransitionEventMention).toBe(5);
    expect(report.completeness.Advisor[0]).toMatchObject({
      field: "legalName",
      filled: 1,
      total: 2,
      pct: 50,
    });
    expect(report.sourceCounts).toContainEqual({
      label: "TransitionEvent",
      n: 2,
    });
    expect(report.articleCategories).toEqual([{ label: "recruiting", n: 3 }]);
    expect(report.recruitingCoverage).toContainEqual({
      label: "article_transition_mentions",
      n: 5,
    });
    expect(report.firmSourceCoverage.advisors).toContainEqual({
      label: "merrill_yext",
      n: 2,
    });
    expect(report.firmSourceCoverage.branches).toContainEqual({
      label: "merrill_yext",
      n: 1,
    });
    expect(report.firmSourceCoverage.firmAliases).toContainEqual({
      label: "wells_fargo_advisors_html",
      n: 2,
    });
    expect(report.freshness.firmSourceChecks).toBe("2026-05-23");
    expect(report.sparseAdvisors[0]?.label).toBe(SPARSE_ADVISOR_LABEL);
    expect(report.freshness.articles).toBe("2026-06-01");
    expect(report.unextractedRecruitingArticles).toEqual([
      { id: "a1", headline: RECRUITING_GAP_HEADLINE },
    ]);

    const rendered = renderDataCoverageReport(report, "test-target");

    expect(rendered).toContain("[data-coverage] target: test-target");
    expect(rendered).toContain("Advisor.legalName");
    expect(rendered).toContain(SPARSE_ADVISOR_LABEL);
    expect(rendered).toContain("transition_events");
    expect(rendered).toContain("Firm-source adapter coverage");
    expect(rendered).toContain("merrill_yext");
    expect(rendered).toContain("Recruiting articles missing moves");
    expect(rendered).toContain(RECRUITING_GAP_HEADLINE);
    expect(rendered).toContain("recruiting extraction gap:");
    expect(rendered).toContain("Freshness warnings");
  });

  it("keeps operator output usable when optional coverage queries fail", async () => {
    const report = await buildDataCoverageReport(async query => {
      if (
        query.includes("SELECT id, headline, category") ||
        query.includes("MAX(publishedDate)")
      ) {
        throw new Error(`simulated read failure for ${query}`);
      }
      return mockCoverageQuery(query);
    });

    expect(report.freshness.articles).toBeNull();
    expect(report.unextractedRecruitingArticles).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "simulated read failure for SELECT id, headline, category"
        ),
        expect.stringContaining(
          "simulated read failure for SELECT MAX(publishedDate)"
        ),
      ])
    );

    const rendered = renderDataCoverageReport(report, "resilient-target");

    expect(rendered).toContain("[data-coverage] target: resilient-target");
    expect(rendered).toContain("Recruiting articles missing moves\n  none");
    expect(rendered).toContain("articles: no dated rows");
    expect(rendered).not.toContain("recruiting extraction gap:");
  });
});
