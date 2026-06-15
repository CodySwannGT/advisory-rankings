import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  buildStifelSearchUrl,
  mapStifelAdvisors,
  parseStifelSearchResults,
  STIFEL_SOURCE_ADAPTER,
} from "../src/lib/stifel.js";

const CHECKED_AT = "2026-05-23";
const FIXTURE_DIR = "tests/fixtures/firm-sources/stifel";
const searchHtml = readFileSync(`${FIXTURE_DIR}/search-response.html`, "utf8");
const emptyHtml = readFileSync(`${FIXTURE_DIR}/empty-response.html`, "utf8");
const blockedHtml = readFileSync(
  `${FIXTURE_DIR}/blocked-response.html`,
  "utf8"
);
const SEARCH_URL = "https://www.stifel.com/fa/search?state=ny";
const KYLE_NAME = "Kyle Abruzzo";
const KYLE_ADVISOR_URL = "https://www.stifel.com/fa/kyle-abruzzo?state=ny";

describe("Stifel scraper mapping", () => {
  it("builds bounded state, ZIP, and name search URLs", () => {
    const stateUrl = new URL(
      buildStifelSearchUrl({ input: "NY", limit: 50, offset: 0 })
    );
    const zipUrl = new URL(
      buildStifelSearchUrl({ input: "10022", limit: 50, offset: 0 })
    );
    const nameUrl = new URL(
      buildStifelSearchUrl({ input: "smith", limit: 25, offset: 25 })
    );

    expect(stateUrl.pathname).toBe("/fa/search");
    expect(stateUrl.searchParams.get("state")).toBe("ny");
    expect(zipUrl.searchParams.get("zipcode")).toBe("10022");
    expect(nameUrl.searchParams.get("name")).toBe("smith");
    expect(nameUrl.searchParams.get("PageNumber")).toBe("2");
  });

  it("describes the observed HTML source contract and limitation", () => {
    const discovery = STIFEL_SOURCE_ADAPTER.discover();

    expect(STIFEL_SOURCE_ADAPTER.firmName).toBe("Stifel");
    expect(STIFEL_SOURCE_ADAPTER.sourceType).toBe("stifel_search_html");
    expect(discovery.locatorUrl).toBe("https://www.stifel.com/fa/search");
    expect(discovery.requestShape).toContain("Server-rendered HTML");
    expect(discovery.pagination).toContain("POST pager");
    expect(discovery.limitation).toContain("No structured JSON");
  });

  it("parses advisor result rows and contact metadata", () => {
    const advisors = parseStifelSearchResults(searchHtml, SEARCH_URL);

    expect(advisors).toHaveLength(2);
    expect(advisors[0]).toMatchObject({
      advisorName: KYLE_NAME,
      advisorUrl: KYLE_ADVISOR_URL,
      branchName: "Hauppauge",
      branchUrl: "https://www.stifel.com/branch/ny/hauppauge",
      businessPhone: "6313605700",
      city: "Hauppauge",
      emailContactName: KYLE_NAME,
      emailUrlFriendlyName: "kyle-abruzzo",
      headshotUrl: "https://www.stifel.com/images/photos/kyle-abruzzo.jpg",
      linkedInUrl: "https://www.linkedin.com/in/kyle-a-146b672b0/",
      roleTitle: "Financial Advisor",
      state: "NY",
      tollFreePhone: "8667067771",
    });
  });

  it("maps advisors, branches, employment, designations, and provenance", () => {
    const advisors = parseStifelSearchResults(searchHtml, SEARCH_URL);
    const rows = mapStifelAdvisors(advisors, CHECKED_AT);

    expect(rows.Firm[0]).toMatchObject({
      name: "Stifel",
      legalName: "Stifel, Nicolaus & Company, Incorporated",
      channel: "regional_bd",
    });
    expect(rows.Branch[0]).toMatchObject({
      name: "Hauppauge",
      city: "Hauppauge",
      state: "NY",
      phone: "6313605700",
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: KYLE_NAME,
      firstName: "Kyle",
      lastName: "Abruzzo",
      businessPhone: "6313605700",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
      sourceType: "stifel_search_html",
    });
    expect(rows.Designation[0]).toMatchObject({
      code: "CFP",
      grantingBody: "CFP",
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      sourceType: "stifel_search_html",
      checkedAt: CHECKED_AT,
      sourcesChecked: [
        KYLE_ADVISOR_URL,
        "https://www.stifel.com/branch/ny/hauppauge",
        SEARCH_URL,
      ],
    });
  });

  it("returns zero rows for empty, malformed, or blocked HTML", () => {
    expect(parseStifelSearchResults(emptyHtml, SEARCH_URL)).toEqual([]);
    expect(
      parseStifelSearchResults("<html><body>changed</body></html>", SEARCH_URL)
    ).toEqual([]);
    expect(parseStifelSearchResults(blockedHtml, SEARCH_URL)).toEqual([]);
  });

  it("skips nameless rows and preserves partial advisor details", () => {
    const edgeHtml = searchHtml
      .replace("Kyle Abruzzo", "   ")
      .replace("Robert Campolongo, CFP&reg;", "Robert Campolongo")
      .replace('href="/fa/robert-campolongo-cfp-aif?state=ny"', "")
      .replace('src="/images/photos/robert-campolongo.jpg"', "")
      .replace("New York, New York", "New York, District of Columbia");

    const advisors = parseStifelSearchResults(edgeHtml, SEARCH_URL);

    expect(advisors).toEqual([
      expect.objectContaining({
        advisorName: "Robert Campolongo",
        advisorUrl: undefined,
        city: "New York",
        headshotUrl: undefined,
        state: "District of Columbia",
        tollFreePhone: undefined,
      }),
    ]);
  });
});
