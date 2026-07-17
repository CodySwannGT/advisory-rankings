import { describe, expect, it } from "vitest";
import {
  MORGAN_STANLEY_SOURCE_ADAPTER,
  buildMorganStanleySearchUrl,
  mapMorganStanleyLocations,
} from "../src/lib/morgan-stanley.js";

const PROFILE_URL = "https://advisor.morganstanley.com/james.stern";
const HEADSHOT_URL = "https://a.mktgcdn.com/p/headshot/1236x1236.jpg";

describe("Morgan Stanley scraper mapping", () => {
  it("builds the Yext feed URL used by the public locator", () => {
    const url = new URL(
      buildMorganStanleySearchUrl({ input: "10022", limit: 10, offset: 20 })
    );
    expect(url.hostname).toBe("prod-cdn.us.yextapis.com");
    expect(url.searchParams.get("experienceKey")).toBe("ms-search-locator");
    expect(url.searchParams.get("verticalKey")).toBe("locations");
    expect(url.searchParams.get("input")).toBe("10022");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("20");
  });

  it("keeps bounded locator URLs valid when no search input is provided", () => {
    const url = new URL(buildMorganStanleySearchUrl({ limit: 5, offset: 0 }));

    expect(url.searchParams.get("input")).toBe("");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("offset")).toBe("0");
  });

  it("builds source adapter search URLs from the shared locator builder", () => {
    const directUrl = buildMorganStanleySearchUrl({
      input: "Boston",
      limit: 25,
      offset: 50,
    });

    expect(MORGAN_STANLEY_SOURCE_ADAPTER.buildSearchUrl("Boston", 25, 50)).toBe(
      directUrl
    );
  });

  it("describes the bounded Yext discovery surface", () => {
    expect(MORGAN_STANLEY_SOURCE_ADAPTER.discover()).toMatchObject({
      locatorUrl: "https://advisor.morganstanley.com/",
      feedUrl: expect.stringContaining("prod-cdn.us.yextapis.com"),
      requestShape: expect.stringContaining("Yext vertical query"),
      pagination: expect.stringContaining("--max-advisors"),
    });
  });

  it("maps advisor, media, branch, team, designation, and research rows", () => {
    const rows = mapMorganStanleyLocations(
      [
        {
          id: "653VG",
          uid: "11088437",
          c_profileType: "FA",
          c_pagesName: "James Howard Stern",
          c_pagesURL: PROFILE_URL,
          c_primaryTitle: "Financial Advisor",
          c_secondaryTitles: ["Senior Portfolio Management Director"],
          c_profilePhotoSquare: {
            image: {
              url: HEADSHOT_URL,
              thumbnails: [
                { url: "https://dynl.mktgcdn.com/p/headshot/600x450.jpg" },
              ],
            },
          },
          c_linkedInURL: "https://www.linkedin.com/in/james-stern-47a372275/",
          c_listOfCertifications: ["CFP® - CERTIFIED FINANCIAL PLANNER®"],
          c_extLocatorFocusAreas: ["Retirement Planning"],
          c_extLocatorLanguages: ["Spanish"],
          c_teamEntityName: "S.E.E.K. Group",
          c_branchID: "517",
          c_branchName: "Stuart",
          mainPhone: "+17722233214",
          emails: ["James.Stern@morganstanley.com"],
          address: {
            line1: "729 SW Federal Hwy",
            line2: "Suite 300",
            city: "Stuart",
            region: "FL",
            postalCode: "34994",
            countryCode: "US",
          },
        },
      ],
      "2026-05-21"
    );

    expect(rows.Firm[0]).toMatchObject({
      name: "Morgan Stanley",
      logoUrl: expect.stringContaining("morgan-stanley-logo"),
    });
    expect(rows.FirmAlias[0]).toMatchObject({
      firmId: rows.Firm[0].id,
      alias: "Morgan Stanley Wealth Management",
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "James Howard Stern",
      firstName: "James",
      middleName: "Howard",
      lastName: "Stern",
      headshotUrl: HEADSHOT_URL,
      businessEmail: "James.Stern@morganstanley.com",
      businessPhone: "+17722233214",
    });
    expect(rows.Branch[0]).toMatchObject({
      name: "Stuart",
      city: "Stuart",
      state: "FL",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor; Senior Portfolio Management Director",
      sourceType: "morgan_stanley_yext",
    });
    expect(rows.Designation[0]).toMatchObject({
      code: "CFP",
      status: "active",
    });
    expect(rows.Team[0]).toMatchObject({ name: "S.E.E.K. Group" });
    expect(rows.TeamMembership[0]).toMatchObject({
      advisorId: rows.Advisor[0].id,
      teamId: rows.Team[0].id,
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      advisorId: rows.Advisor[0].id,
      sourceType: "morgan_stanley_yext",
      checkedAt: "2026-05-21",
      sourcesChecked: [
        PROFILE_URL,
        "https://www.linkedin.com/in/james-stern-47a372275/",
      ],
    });
  });
});
