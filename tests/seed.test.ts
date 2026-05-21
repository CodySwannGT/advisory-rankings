import { describe, expect, it } from "vitest";
import seedData from "../src/data/seed-data.json" with { type: "json" };

describe("seed data", () => {
  it("preserves the canonical seed footprint", () => {
    const tables = Object.keys(seedData);
    const total = Object.values(seedData).reduce(
      (sum, rows) => sum + (rows as unknown[]).length,
      0
    );
    expect(tables).toHaveLength(23);
    expect(total).toBe(99);
    expect(seedData.Firm).toHaveLength(10);
    expect(seedData.Advisor).toHaveLength(12);
    expect(seedData.Article).toHaveLength(2);
  });
});
