import { describe, expect, it } from "vitest";
import seedData from "../src/data/seed-data.json" with { type: "json" };

describe("seed data", () => {
  it("preserves the canonical seed footprint", () => {
    const tables = Object.keys(seedData);
    const total = Object.values(seedData).reduce(
      (sum, rows) => sum + (rows as unknown[]).length,
      0
    );
    expect(tables).toHaveLength(27);
    expect(total).toBe(106);
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
});
