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
  Article: 3,
  TransitionEvent: 4,
  ArticleTransitionEventMention: 5,
  FieldAssertion: 6,
  EmploymentHistory: 7,
  Disclosure: 8,
  AdvisorResearchCheck: 9,
};

const SPARSE_ADVISOR_LABEL = "Sparse Advisor";

describe("data coverage report", () => {
  it("summarizes counts, completeness, recruiting coverage, and sparse rows", async () => {
    const report = await buildDataCoverageReport(async query => {
      if (query.includes("GROUP BY targetTable")) {
        return [
          { label: "Advisor", n: 3 },
          { label: "TransitionEvent", n: 2 },
        ];
      }
      if (query.includes("GROUP BY category")) {
        return [{ label: "recruiting", n: 3 }];
      }
      if (query.includes("FROM data.Advisor") && query.includes("missing")) {
        return [{ id: "adv-1", label: SPARSE_ADVISOR_LABEL, missing: 2 }];
      }
      if (query.includes("FROM data.Firm") && query.includes("missing")) {
        return [{ id: "firm-1", label: "Sparse Firm", missing: 1 }];
      }
      if (query.includes("transition_events")) {
        return [
          { label: "transition_events", n: 4 },
          { label: "article_transition_mentions", n: 5 },
          { label: "transition_field_assertions", n: 2 },
        ];
      }
      if (query.includes("MAX(publishedDate)"))
        return [{ latest: "2026-06-01" }];
      if (query.includes("MAX(eventDate)")) return [{ latest: "2026-05-20" }];
      if (query.includes("IS NOT NULL")) return [{ n: 1 }];
      return [{ n: numberFrom(query) }];
    });

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
    expect(report.sparseAdvisors[0]?.label).toBe(SPARSE_ADVISOR_LABEL);
    expect(report.freshness.articles).toBe("2026-06-01");

    const rendered = renderDataCoverageReport(report, "test-target");

    expect(rendered).toContain("[data-coverage] target: test-target");
    expect(rendered).toContain("Advisor.legalName");
    expect(rendered).toContain(SPARSE_ADVISOR_LABEL);
    expect(rendered).toContain("transition_events");
    expect(rendered).toContain("Freshness warnings");
  });
});
