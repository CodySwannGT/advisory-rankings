import { describe, expect, it } from "vitest";
import {
  emptyFirmSourceRows,
  firmSourceFixtureDir,
  FirmSourceRows,
  FirmSourceRunOptions,
  firmSourceScriptName,
  firmSourceScriptPath,
  DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
  DEFAULT_FIRM_SOURCE_PAGE_SIZE,
  FIRM_SOURCE_SAMPLE_LIMIT,
  FIRM_SOURCE_TABLES,
} from "../src/lib/firm-source-adapter.js";

const RAYMOND_JAMES_SLUG = "raymond-james";

describe("firm source adapter contract", () => {
  it("keeps the shared table contract aligned with current scraper output", () => {
    expect(FIRM_SOURCE_TABLES).toEqual([
      "Firm",
      "FirmAlias",
      "Branch",
      "Advisor",
      "EmploymentHistory",
      "Designation",
      "Team",
      "TeamMembership",
      "AdvisorResearchCheck",
    ]);
    expect(Object.keys(emptyFirmSourceRows())).toEqual(FIRM_SOURCE_TABLES);
  });

  it("defines script and fixture conventions for new firm sources", () => {
    expect(firmSourceScriptName(RAYMOND_JAMES_SLUG)).toBe(
      "scrape:raymond-james"
    );
    expect(firmSourceScriptPath(RAYMOND_JAMES_SLUG)).toBe(
      "src/scripts/scrape_raymond_james.ts"
    );
    expect(firmSourceFixtureDir(RAYMOND_JAMES_SLUG)).toBe(
      "tests/fixtures/firm-sources/raymond-james"
    );
    expect(FIRM_SOURCE_SAMPLE_LIMIT).toBe(5);
  });

  it("initializes empty adapter rows for each Harper table", () => {
    const rows = new FirmSourceRows();

    for (const tableName of FIRM_SOURCE_TABLES) {
      expect(rows[tableName]).toEqual([]);
    }
  });

  it("defaults scraper run options to a bounded dry run", () => {
    expect(new FirmSourceRunOptions()).toEqual({
      checkedAt: "",
      json: false,
      maxAdvisors: DEFAULT_FIRM_SOURCE_MAX_ADVISORS,
      pageSize: DEFAULT_FIRM_SOURCE_PAGE_SIZE,
      queries: [],
      write: false,
    });
  });
});
