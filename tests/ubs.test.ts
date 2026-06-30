import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  buildUbsSearchBody,
  buildUbsSearchUrl,
  emptyUbsRows,
  mapUbsAdvisors,
  parseUbsSearchResponse,
  UBS_SOURCE_ADAPTER,
  type UbsAdvisorEntity,
} from "../src/lib/ubs.js";

const CHECKED_AT = "2026-05-23";
const FIXTURE_DIR = "tests/fixtures/firm-sources/ubs";
const searchPayload = JSON.parse(
  readFileSync(`${FIXTURE_DIR}/search-response.json`, "utf8")
) as unknown;
const emptyPayload = JSON.parse(
  readFileSync(`${FIXTURE_DIR}/empty-response.json`, "utf8")
) as unknown;
const malformedPayload = JSON.parse(
  readFileSync(`${FIXTURE_DIR}/malformed-response.json`, "utf8")
) as unknown;
const STEVEN_SMITH = "Steven Smith";
const STEVEN_PROFILE_URL = "https://advisors.ubs.com/steven.a.smith/";
const OAKBROOK_BRANCH_URL = "https://local.ubs.com/oakbrook-il";
const UBS_FIRM_NAME = "UBS Wealth Management USA";
const BOSTON_BRANCH_URL = "https://local.ubs.com/boston-ma";
const UBS_LOCATOR_URL = "https://advisors.ubs.com/find-an-advisor/";
const DENVER_BRANCH_URL = "https://local.ubs.com/denver-co";
const BLAIR_PROFILE_URL = "https://advisors.ubs.com/blair.parent/";

describe("UBS scraper mapping", () => {
  it("builds the UBS API URL and bounded name-search body", () => {
    const url = new URL(
      buildUbsSearchUrl({ input: "smith", limit: 5, offset: 0 })
    );
    const body = buildUbsSearchBody("smith", 5);

    expect(url.hostname).toBe("presenter.broadridgeadvisor.com");
    expect(url.pathname).toBe("/locator/api/Search");
    expect(url.searchParams.get("query")).toBe("smith");
    expect(
      new URL(
        buildUbsSearchUrl({ input: "", limit: 5, offset: 10 })
      ).searchParams.get("offset")
    ).toBe("10");
    expect(body).toMatchObject({
      locator: "UBS",
      Company: "%smith",
      ProfileTypes: "Individual",
      SearchRadius: 25,
      MaxResults: 5,
      DoFuzzyNameSearch: 0,
    });
  });

  it("describes the observed Broadridge source contract and limitation", () => {
    const discovery = UBS_SOURCE_ADAPTER.discover();

    expect(UBS_SOURCE_ADAPTER.firmName).toBe(UBS_FIRM_NAME);
    expect(UBS_SOURCE_ADAPTER.sourceType).toBe("ubs_broadridge_presenter");
    expect(discovery.feedUrl).toContain("/locator/api/Search");
    expect(discovery.requestShape).toContain("Broadridge Presenter JSON POST");
    expect(discovery.pagination).toContain("Bounded name search");
    expect(discovery.limitation).toContain("Team fields");
  });

  it("parses individual entities and rejects malformed envelopes", () => {
    const advisors = parseUbsSearchResponse(searchPayload);

    expect(advisors).toHaveLength(2);
    expect(advisors[0]).toMatchObject({
      ProfileId: 938038,
      ProfileType: "Individual",
      Company: STEVEN_SMITH,
      AdditionalData: {
        EntityId: "161256",
        MarketingName: STEVEN_SMITH,
        ParentMarketingName: "Oakbrook Terrace, IL Branch Office",
      },
    });
    expect(parseUbsSearchResponse(emptyPayload)).toEqual([]);
    expect(() => parseUbsSearchResponse(null)).toThrow("not a JSON object");
    expect(() => parseUbsSearchResponse(malformedPayload)).toThrow("Entity[]");
  });

  it("maps advisors, branches, employment, and provenance", () => {
    const advisors = parseUbsSearchResponse(searchPayload);
    const rows = mapUbsAdvisors(advisors, CHECKED_AT);

    expect(rows.Firm[0]).toMatchObject({
      name: "UBS Wealth Management USA",
      legalName: "UBS Financial Services Inc.",
      channel: "wirehouse",
    });
    expect(rows.Branch[0]).toMatchObject({
      name: "Oakbrook Terrace, IL Branch Office",
      address: "One Tower Lane, Oakbrook Terrace Tower, Suite 1700",
      city: "Oakbrook Terrace",
      state: "IL",
      sourceRef: OAKBROOK_BRANCH_URL,
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: STEVEN_SMITH,
      firstName: "Steven",
      lastName: "Smith",
      businessEmail: "steven.a.smith@ubs.com",
      businessPhone: "6305722273",
    });
    expect(String(rows.Advisor[0].bioText)).toContain(
      "Oakbrook Terrace Wealth Team"
    );
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
      sourceType: "ubs_broadridge_presenter",
      sourceRef: STEVEN_PROFILE_URL,
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      sourceType: "ubs_broadridge_presenter",
      checkedAt: CHECKED_AT,
      sourcesChecked: [
        STEVEN_PROFILE_URL,
        OAKBROOK_BRANCH_URL,
        UBS_LOCATOR_URL,
      ],
    });
    expect(rows.Team).toEqual([]);
    expect(rows.TeamMembership).toEqual([]);
  });

  it("handles sparse entities, array team fields, and empty mapper input", () => {
    const sparse: UbsAdvisorEntity = {
      ProfileId: "sparse-id",
      ProfileType: "Individual",
      Company: "Alex Sparse",
      FirstName: "Alex",
      LastName: "",
      Addresses: [
        {
          Address1: "100 Main Street",
          City: "Boston",
          Region: "MA",
          PostalCode: "02110",
        },
      ],
      AdditionalData: {
        JobTitle: null,
        ParentSiteUrl: BOSTON_BRANCH_URL,
        SiteName: null,
        TeamSiteNames: ["Boston Team"],
        TeamSiteUrls: ["https://advisors.ubs.com/boston-team/"],
      },
    };
    const parentSiteFallback: UbsAdvisorEntity = {
      UniqueId: "unique-only",
      ProfileType: "Individual",
      Company: "Blair Parent",
      Addresses: [
        {
          Address1: "200 Market Street",
          Address2: "Floor 4",
          City: "Denver",
          Region: "CO",
          PostalCode: "80202",
        },
      ],
      AdditionalData: {
        Emails: "blair.parent@ubs.com, assistant@example.com",
        ParentSiteUrl: "//local.ubs.com/denver-co",
        SiteName: "blair.parent",
      },
    };
    const addressFallback: UbsAdvisorEntity = {
      ProfileType: "Individual",
      Company: "Casey Noid",
      Addresses: [
        {
          City: "Austin",
          Region: "TX",
        },
      ],
      AdditionalData: {},
    };

    const emptyRows = mapUbsAdvisors([]);
    const rows = mapUbsAdvisors(
      [sparse, parentSiteFallback, addressFallback],
      CHECKED_AT
    );

    expect(emptyRows).toMatchObject({
      ...emptyUbsRows(),
      Firm: [{ name: UBS_FIRM_NAME }],
    });
    expect(rows.Branch[0]).toMatchObject({
      name: "Boston, MA",
      sourceRef: BOSTON_BRANCH_URL,
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Alex Sparse",
      firstName: "Alex",
      careerStatus: "active",
    });
    expect(String(rows.Advisor[0].bioText)).toContain("Boston Team");
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
    });
    expect(rows.AdvisorResearchCheck[0].sourcesChecked).toEqual([
      BOSTON_BRANCH_URL,
      UBS_LOCATOR_URL,
    ]);
    expect(rows.Branch[1]).toMatchObject({
      name: "Denver, CO",
      address: "200 Market Street, Floor 4",
      sourceRef: DENVER_BRANCH_URL,
    });
    expect(rows.Advisor[1]).toMatchObject({
      legalName: "Blair Parent",
      firstName: "Blair",
      lastName: "Parent",
      businessEmail: "blair.parent@ubs.com",
    });
    expect(rows.EmploymentHistory[1]).toMatchObject({
      sourceRef: BLAIR_PROFILE_URL,
    });
    expect(rows.AdvisorResearchCheck[1].sourcesChecked).toEqual([
      BLAIR_PROFILE_URL,
      DENVER_BRANCH_URL,
      UBS_LOCATOR_URL,
    ]);
    expect(rows.Branch[2]).toMatchObject({
      name: "Austin, TX",
    });
    expect(rows.Branch[2]).not.toHaveProperty("sourceRef");
    expect(rows.Advisor[2]).toMatchObject({
      legalName: "Casey Noid",
      firstName: "Casey",
      lastName: "Noid",
    });
    expect(rows.Advisor[2]).not.toHaveProperty("businessEmail");
  });
});
