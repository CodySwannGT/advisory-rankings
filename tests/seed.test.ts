import { describe, expect, it } from "vitest";
import seedData from "../src/data/seed-data.json" with { type: "json" };

describe("seed data", () => {
  it("preserves the canonical seed footprint", () => {
    const tables = Object.keys(seedData);
    const total = Object.values(seedData).reduce(
      (sum, rows) => sum + (rows as unknown[]).length,
      0
    );
    expect(tables).toHaveLength(28);
    expect(total).toBe(118);
    expect(seedData.Firm).toHaveLength(10);
    expect(seedData.FirmAlias).toHaveLength(1);
    expect(seedData.FirmMergeAudit).toHaveLength(1);
    expect(seedData.Advisor).toHaveLength(12);
    expect(seedData.Article).toHaveLength(2);
    expect(seedData.Ranking).toHaveLength(2);
    expect(seedData.RankingEntry).toHaveLength(3);
    expect(seedData.Firm.some(firm => firm.name === "Morgan Stanley")).toBe(
      true
    );
    expect(
      seedData.Firm.some(
        firm => firm.name === "Morgan Stanley Wealth Management"
      )
    ).toBe(false);
  });

  describe("advisor evidence fixtures (PRD #256 / issue #683)", () => {
    const TAYLOR = "4fbd3720-bde5-5cd5-b1a2-7b37424ad7ea";
    const DRUMM = "f574f6e2-56b9-5650-9c43-c3d52f81d94f";

    const advisorChecks = (advisorId: string) =>
      seedData.AdvisorResearchCheck.filter(
        check => check.advisorId === advisorId
      );
    const advisorAssertions = (advisorId: string) =>
      seedData.FieldAssertion.filter(
        assertion =>
          assertion.targetTable === "Advisor" &&
          assertion.targetId === advisorId
      );
    const latestStatus = (advisorId: string) => {
      const sorted = advisorChecks(advisorId)
        .slice()
        .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
      return sorted[sorted.length - 1]?.status;
    };

    it("seeds an advisor with a loaded evidence-freshness footprint", () => {
      const checks = advisorChecks(TAYLOR);
      expect(checks.length).toBeGreaterThan(0);
      // Source-type coverage spans all four research source types.
      expect(new Set(checks.map(check => check.sourceType))).toEqual(
        new Set(["web_research", "firm_bio", "rankings", "press"])
      );
      // Latest check is a clean (non-warning) status.
      expect(["success", "no_new_data"]).toContain(latestStatus(TAYLOR));
    });

    it("seeds an advisor whose latest check drives the warning state", () => {
      const statuses = advisorChecks(DRUMM).map(check => check.status);
      expect(statuses.some(s => s === "ambiguous" || s === "failed")).toBe(
        true
      );
      expect(["ambiguous", "failed"]).toContain(latestStatus(DRUMM));
    });

    it("seeds advisor-targeted assertions spanning all confidence levels", () => {
      const taylor = advisorAssertions(TAYLOR);
      const levels = new Set(taylor.map(a => a.confidence));
      expect(levels).toEqual(new Set(["asserted", "inferred", "derived"]));
      // confidenceSummary total must equal the sum of per-level counts.
      const perLevel = ["asserted", "inferred", "derived"].reduce(
        (sum, level) => sum + taylor.filter(a => a.confidence === level).length,
        0
      );
      expect(perLevel).toBe(taylor.length);
    });

    it("keeps at least one advisor with no checks or assertions", () => {
      const noData = seedData.Advisor.find(
        advisor =>
          advisorChecks(advisor.id).length === 0 &&
          advisorAssertions(advisor.id).length === 0
      );
      expect(noData).toBeDefined();
    });
  });
});
