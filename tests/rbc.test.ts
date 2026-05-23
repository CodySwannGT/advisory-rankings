import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  buildRbcSearchUrl,
  mapRbcAdvisors,
  parseRbcAdvisors,
  parseRbcBranches,
  parseRbcNonce,
  RBC_SOURCE_ADAPTER,
} from "../src/lib/rbc.js";

const FIXTURE_DIR = "tests/fixtures/firm-sources/rbc";
const CHECKED_AT = "2026-05-23";
const finderHtml = readFileSync(`${FIXTURE_DIR}/finder.html`, "utf8");
const branchesHtml = readFileSync(`${FIXTURE_DIR}/branches.html`, "utf8");
const advisorsHtml = readFileSync(`${FIXTURE_DIR}/advisors.html`, "utf8");

describe("RBC scraper mapping", () => {
  it("builds the RBC AJAX endpoint URL and discovers the contract", () => {
    const url = new URL(
      buildRbcSearchUrl({ input: "10022", limit: 5, offset: 0 })
    );
    const discovery = RBC_SOURCE_ADAPTER.discover();

    expect(url.pathname).toBe("/en-us/wp-admin/admin-ajax.php");
    expect(url.searchParams.get("input")).toBe("10022");
    expect(parseRbcNonce(finderHtml)).toBe("abc123");
    expect(discovery.requestShape).toContain("rbcwm_get_advisors_branches");
    expect(discovery.limitation).toContain("HTML fragments");
  });

  it("parses branch and advisor AJAX HTML fragments", () => {
    const branches = parseRbcBranches(branchesHtml);
    const advisors = parseRbcAdvisors(advisorsHtml, branches[0]);

    expect(branches[0]).toMatchObject({
      branchId: "1985586",
      name: "New York City",
      address: "1211 Avenue of The Americas, Suite 3300",
      city: "New York",
      state: "NY",
      postalCode: "10036",
      branchUrl: "https://us.rbcwealthmanagement.com/web/NewYorkCity",
    });
    expect(advisors[0]).toMatchObject({
      advisorName: "Kristin Ashman, JD*",
      businessEmail: "kristin.ashman@rbc.com",
      businessPhone: "2127038002",
      headshotUrl:
        "https://us.rbcwealthmanagement.com/delegate/services/file/5207991/content",
    });
  });

  it("maps advisors into Harper rows with provenance", () => {
    const branches = parseRbcBranches(branchesHtml);
    const advisors = parseRbcAdvisors(advisorsHtml, branches[0]);
    const rows = mapRbcAdvisors(advisors, CHECKED_AT);

    expect(rows.Firm[0]).toMatchObject({
      name: "RBC Wealth Management",
      legalName: "RBC Capital Markets, LLC",
    });
    expect(rows.Branch[0]).toMatchObject({
      name: "New York City",
      city: "New York",
      state: "NY",
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Kristin Ashman, JD*",
      firstName: "Kristin",
      lastName: "Ashman",
      businessEmail: "kristin.ashman@rbc.com",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
      sourceType: "rbc_wealth_management_ajax",
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      sourceType: "rbc_wealth_management_ajax",
      checkedAt: CHECKED_AT,
      sourcesChecked: [
        "https://us.rbcwealthmanagement.com/web/degenaarsbabbgroup",
        "https://us.rbcwealthmanagement.com/web/NewYorkCity",
      ],
    });
  });
});
