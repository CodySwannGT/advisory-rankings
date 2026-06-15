import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  buildWellsFargoSearchUrl,
  mapWellsFargoAdvisors,
  parseWellsFargoBranchAdvisors,
  parseWellsFargoLocatorBranches,
  WELLS_FARGO_SOURCE_ADAPTER,
} from "../src/lib/wells-fargo.js";

const CHECKED_AT = "2026-05-23";
const FIXTURE_DIR = "tests/fixtures/firm-sources/wells-fargo";
const SCRAPER_PATH = "src/scripts/scrape_wells_fargo.ts";
const searchHtml = readFileSync(`${FIXTURE_DIR}/search-response.html`, "utf8");
const branchHtml = readFileSync(`${FIXTURE_DIR}/branch-response.html`, "utf8");
const SEARCH_URL =
  "https://www.wellsfargo.com/locator/wellsfargoadvisors/search?zip5=10022";
const BRANCH_URL = "https://home.wellsfargoadvisors.com/001_NYKC";
const BUSINESS_PHONE = "6099268600";

describe("Wells Fargo Advisors scraper mapping", () => {
  it("builds the public HTML locator URL used for ZIP search", () => {
    const url = new URL(
      buildWellsFargoSearchUrl({ input: "10022", limit: 5, offset: 0 })
    );

    expect(url.hostname).toBe("www.wellsfargo.com");
    expect(url.pathname).toBe("/locator/wellsfargoadvisors/search");
    expect(url.searchParams.get("zip5")).toBe("10022");
    expect(url.searchParams.get("chkWFA")).toBe("001");
    expect(url.searchParams.get("chkFNet")).toBe("072");
    expect(url.searchParams.get("chkBIS")).toBe("020");
  });

  it("describes the observed HTML source contract and limitation", () => {
    const discovery = WELLS_FARGO_SOURCE_ADAPTER.discover();
    const cityUrl = new URL(
      WELLS_FARGO_SOURCE_ADAPTER.buildSearchUrl("New York", 25, 25)
    );

    expect(WELLS_FARGO_SOURCE_ADAPTER.firmName).toBe("Wells Fargo Advisors");
    expect(WELLS_FARGO_SOURCE_ADAPTER.sourceType).toBe(
      "wells_fargo_advisors_html"
    );
    expect(discovery.locatorUrl).toContain("/locator/wellsfargoadvisors/");
    expect(discovery.requestShape).toContain("Server-rendered HTML");
    expect(discovery.limitation).toContain("not a structured API");
    expect(cityUrl.searchParams.get("city")).toBe("New York");
    expect(cityUrl.searchParams.get("start")).toBe("26");
  });

  it("keeps the scraper file under TypeScript and lint checking", () => {
    const scraperSource = readFileSync(SCRAPER_PATH, "utf8");

    expect(scraperSource).not.toContain("@ts-nocheck");
    expect(scraperSource).not.toContain("eslint-disable");
  });

  it("parses locator branches and branch advisor lists", () => {
    const branches = parseWellsFargoLocatorBranches(searchHtml, SEARCH_URL);
    const advisors = parseWellsFargoBranchAdvisors(
      branchHtml,
      branches[0].branchUrl ?? "",
      branches[0]
    );

    expect(branches[0]).toMatchObject({
      name: "WELLS FARGO ADVISORS",
      branchUrl: BRANCH_URL,
      phone: BUSINESS_PHONE,
      tollFree: "8005469094",
      fax: "6099267884",
    });
    expect(advisors).toHaveLength(2);
    expect(advisors[0]).toMatchObject({
      advisorName: "CHRISTOPHER COBB",
      advisorUrl: "https://home.wellsfargoadvisors.com/christopher.cobb",
      branch: {
        name: "NEW YORK Branch",
        address: "535 MADISON AVENUE, 16TH FLOOR",
        city: "NEW YORK",
        state: "NY",
        postalCode: "10022",
        branchCode: "NYKC",
      },
    });
  });

  it("ignores malformed locator rows while preserving partial branches", () => {
    const malformedHtml = `
      <table>
        <tr><td class="tableData">Only one cell</td></tr>
        <tr>
          <td class="tableData"><strong>2. </strong></td>
          <td class="tableData">distance</td>
          <td class="tableData">Phone: (111) 222-3333</td>
        </tr>
        <tr>
          <td class="tableData">
            <strong><a>3. Partial Branch</a></strong>
            <div>Unknown Address</div>
            <div>Not a city block</div>
          </td>
          <td class="tableData">distance</td>
          <td class="tableData">No contact labels</td>
        </tr>
      </table>
    `;

    const branches = parseWellsFargoLocatorBranches(malformedHtml, SEARCH_URL);

    expect(branches).toEqual([
      {
        branchUrl: undefined,
        fax: undefined,
        name: "Partial Branch",
        phone: undefined,
        tollFree: undefined,
      },
    ]);
  });

  it("filters nameless branch advisor anchors and keeps fallback metadata", () => {
    const advisors = parseWellsFargoBranchAdvisors(
      `<html><body><ul id="ourFAs"><li><a href="/named">Named Advisor</a></li><li><a href="/blank"> </a></li></ul></body></html>`,
      BRANCH_URL,
      {
        branchUrl: BRANCH_URL,
        name: "Fallback Branch",
        phone: BUSINESS_PHONE,
      }
    );

    expect(advisors).toEqual([
      {
        advisorName: "Named Advisor",
        advisorUrl: "https://home.wellsfargoadvisors.com/named",
        branch: {
          branchUrl: BRANCH_URL,
          name: "Fallback Branch",
          phone: BUSINESS_PHONE,
        },
      },
    ]);
  });

  it("maps advisors, branches, employment, aliases, and provenance", () => {
    const branches = parseWellsFargoLocatorBranches(searchHtml, SEARCH_URL);
    const advisors = parseWellsFargoBranchAdvisors(
      branchHtml,
      branches[0].branchUrl ?? "",
      branches[0]
    );
    const rows = mapWellsFargoAdvisors(advisors, CHECKED_AT);

    expect(rows.Firm[0]).toMatchObject({
      name: "Wells Fargo Advisors",
      legalName: "Wells Fargo Clearing Services, LLC",
    });
    expect(rows.FirmAlias).toHaveLength(2);
    expect(rows.Branch[0]).toMatchObject({
      name: "NEW YORK Branch",
      city: "NEW YORK",
      state: "NY",
      phone: BUSINESS_PHONE,
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "CHRISTOPHER COBB",
      firstName: "CHRISTOPHER",
      lastName: "COBB",
      businessPhone: BUSINESS_PHONE,
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
      sourceType: "wells_fargo_advisors_html",
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      sourceType: "wells_fargo_advisors_html",
      checkedAt: CHECKED_AT,
      sourcesChecked: [
        "https://home.wellsfargoadvisors.com/christopher.cobb",
        BRANCH_URL,
      ],
    });
  });
});
