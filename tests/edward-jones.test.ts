import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildEdwardJonesSearchUrl,
  EDWARD_JONES_RESULTS_API_URL,
  EDWARD_JONES_SOURCE_ADAPTER,
  emptyEdwardJonesRows,
  mapEdwardJonesAdvisors,
  type EdwardJonesSearchResponse,
} from "../src/lib/edward-jones.js";

const fixture = (name: string): string =>
  readFileSync(`tests/fixtures/firm-sources/edward-jones/${name}`, "utf8");

describe("Edward Jones source adapter", () => {
  it("documents public JSON feed discovery", () => {
    expect(
      buildEdwardJonesSearchUrl({
        input: "10022",
        distance: 50,
        page: 2,
        pageSize: 16,
        searchType: 2,
      })
    ).toBe(
      "https://www.edwardjones.com/api/v3/financial-advisor/results?q=10022&distance=50&distance_unit=mi&page=2&pageSize=16&matchblock=&searchtype=2"
    );
    expect(EDWARD_JONES_SOURCE_ADAPTER.buildSearchUrl("10022", 16, 16)).toBe(
      "https://www.edwardjones.com/api/v3/financial-advisor/results?q=10022&distance=50&distance_unit=mi&page=2&pageSize=16&matchblock=&searchtype=2"
    );
    expect(EDWARD_JONES_SOURCE_ADAPTER.discover()).toMatchObject({
      locatorUrl:
        "https://www.edwardjones.com/us-en/search/financial-advisor/results",
      feedUrl: EDWARD_JONES_RESULTS_API_URL,
      requestShape: expect.stringContaining(
        "/api/v3/financial-advisor/results"
      ),
    });
  });

  it("maps locator response rows to Harper source rows", () => {
    const response = JSON.parse(
      fixture("sample-response.json")
    ) as EdwardJonesSearchResponse;
    const rows = mapEdwardJonesAdvisors(response.results ?? [], "2026-05-23");

    expect(rows.Firm).toHaveLength(1);
    expect(rows.Branch).toHaveLength(1);
    expect(rows.Advisor).toHaveLength(2);
    expect(rows.Firm[0]).toMatchObject({
      name: "Edward Jones",
      legalName: "Edward D. Jones & Co., L.P.",
    });
    expect(rows.Branch[0]).toMatchObject({
      address: "825 Third Avenue Suite 2500, New York, NY 10022",
      city: "New York",
      state: "NY",
      postalCode: "10022",
      sourceType: "edward_jones_advisor_results_api",
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Rolland Bravo",
      businessPhone: "7183881768",
      headshotUrl:
        "https://edwardjoneslive.pc.cdn.bitgravity.com/assets/fa-pictures/600x900/1798657.jpg",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      firmId: rows.Firm[0].id,
      roleTitle: "Financial Advisor",
      sourceRef:
        "https://www.edwardjones.com/us-en/financial-advisor/rolland-bravo",
    });
    expect(rows.AdvisorResearchCheck[0].notes).toContain(
      "Certifications: AAMS"
    );
  });

  it("handles empty and partial source rows", () => {
    expect(emptyEdwardJonesRows().Advisor).toEqual([]);
    expect(mapEdwardJonesAdvisors([{ faName: "" }])).toMatchObject({
      Advisor: [],
    });
    const rows = mapEdwardJonesAdvisors([
      {
        faName: "No Url Advisor",
        address: "1 Main St, Sample, NY 10001",
      },
    ]);
    expect(rows.Advisor).toHaveLength(1);
    expect(rows.EmploymentHistory[0]).toMatchObject({
      sourceRef:
        "https://www.edwardjones.com/us-en/search/financial-advisor/results",
    });
  });
});
