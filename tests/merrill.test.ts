import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  buildMerrillSearchUrl,
  MERRILL_SOURCE_ADAPTER,
  mapMerrillAdvisors,
} from "../src/lib/merrill.js";

const MERRILL_FIRM_NAME = "Merrill Lynch Wealth Management";
const CHECKED_AT = "2026-05-23";
const SPARSE_ADVISOR_URL = "https://advisor.ml.com/sparse-advisor";

const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/firm-sources/merrill/sample-response.json",
    "utf8"
  )
) as {
  readonly response: {
    readonly results: ReadonlyArray<{ readonly data: Record<string, unknown> }>;
  };
};

describe("Merrill scraper mapping", () => {
  it("builds the Yext feed URL used by the public advisor locator", () => {
    const url = new URL(
      buildMerrillSearchUrl({ input: "10022", limit: 5, offset: 10 })
    );
    expect(url.hostname).toBe("liveapi-cached.yext.com");
    expect(url.searchParams.get("experienceKey")).toBe("merrill_answers");
    expect(url.searchParams.get("verticalKey")).toBe("financial_professionals");
    expect(url.searchParams.get("input")).toBe("10022");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("offset")).toBe("10");
  });

  it("describes the discovered public source contract", () => {
    const discovery = MERRILL_SOURCE_ADAPTER.discover();
    const url = new URL(MERRILL_SOURCE_ADAPTER.buildSearchUrl("", 3, 6));

    expect(MERRILL_SOURCE_ADAPTER.firmName).toBe(MERRILL_FIRM_NAME);
    expect(MERRILL_SOURCE_ADAPTER.sourceType).toBe("merrill_yext");
    expect(discovery.locatorUrl).toBe("https://advisor.ml.com/search");
    expect(discovery.feedUrl).toContain("liveapi-cached.yext.com");
    expect(discovery.requestShape).toContain("merrill_answers");
    expect(discovery.pagination).toContain("Offset/limit");
    expect(url.searchParams.get("input")).toBe("");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("offset")).toBe("6");
  });

  it("maps advisor, media, branch, team, designation, and research rows", () => {
    const rows = mapMerrillAdvisors(
      fixture.response.results.map(result => result.data),
      CHECKED_AT
    );

    expect(rows.Firm[0]).toMatchObject({
      name: MERRILL_FIRM_NAME,
      legalName: "Merrill Lynch, Pierce, Fenner & Smith Incorporated",
    });
    expect(rows.FirmAlias[0]).toMatchObject({
      alias: "Bank of America Merrill Lynch",
      confidence: "source",
    });
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Aidan Santorsa",
      firstName: "Aidan",
      lastName: "Santorsa",
      headshotUrl: expect.stringContaining(
        "Furgu8kruGM8OOBm4hqqbYN1gFKvFUtKTyLmDJtq3Oo"
      ),
      businessEmail: "aidan.santorsa@ml.com",
      businessPhone: "8132738635",
    });
    expect(rows.Branch[0]).toMatchObject({
      city: "Tampa",
      state: "FL",
      postalCode: "33602",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "FSA - Merrill",
      startDate: "2024-01-01",
      sourceType: "merrill_yext",
    });
    expect(rows.Designation[0]).toMatchObject({
      code: "PIA",
      status: "active",
    });
    expect(rows.Team[0]).toMatchObject({ name: "Tampa Financial Center" });
    expect(rows.TeamMembership[0]).toMatchObject({
      advisorId: rows.Advisor[0].id,
      teamId: rows.Team[0].id,
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      advisorId: rows.Advisor[0].id,
      sourceType: "merrill_yext",
      checkedAt: CHECKED_AT,
      sourcesChecked: [
        "https://advisor.ml.com/sites/fl/tampa-fl/aidan.santorsa",
      ],
    });
  });

  it("skips closed or unnamed rows and tolerates optional Merrill fields", () => {
    const rows = mapMerrillAdvisors(
      [
        { id: "closed", name: "Closed Advisor", closed: true },
        { id: "unnamed", c_marketingName: "" },
        {
          id: "open",
          name: "Open Advisor",
          slug: "open-advisor",
          c_displayTeamName: false,
          c_language: [{ language: "French" }, { language: "" }],
          c_profilePicture: {},
          address: {
            city: "New York",
            region: "NY",
            countryCode: "US",
            postalCode: "10019",
          },
        },
      ],
      CHECKED_AT
    );

    expect(rows.Advisor).toHaveLength(1);
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Open Advisor",
      firstName: "Open",
      lastName: "Advisor",
      bioText: "Languages: French",
    });
    expect(rows.Team).toEqual([]);
    expect(rows.TeamMembership).toEqual([]);
    expect(rows.EmploymentHistory[0]).toMatchObject({
      sourceRef: "https://advisor.ml.com/open-advisor",
    });
    expect(rows.Designation).toEqual([]);
  });

  it("maps sparse Yext rows through fallback names, ids, and URLs", () => {
    const rows = mapMerrillAdvisors(
      [
        {
          uid: "uid-only",
          c_marketingName: "Sparse Advisor",
          c_languagesV2: ["Spanish", "Portuguese"],
          emails: ["sparse.advisor@example.com"],
          websiteUrl: { url: SPARSE_ADVISOR_URL },
        },
        {
          c_marketingName: "Nameless Identifier",
          address: null,
          c_language: "English",
        },
      ],
      CHECKED_AT
    );

    expect(rows.Advisor).toHaveLength(2);
    expect(rows.Advisor[0]).toMatchObject({
      legalName: "Sparse Advisor",
      firstName: "Sparse",
      lastName: "Advisor",
      businessEmail: "sparse.advisor@example.com",
      bioText: "Languages: Spanish, Portuguese",
    });
    expect(rows.EmploymentHistory[0]).toMatchObject({
      sourceRef: SPARSE_ADVISOR_URL,
    });
    expect(rows.AdvisorResearchCheck[0]).toMatchObject({
      sourcesChecked: [SPARSE_ADVISOR_URL],
    });
    expect(rows.Advisor[1]).toMatchObject({
      legalName: "Nameless Identifier",
      firstName: "Nameless",
      lastName: "Identifier",
    });
    expect(rows.Advisor[1]).not.toHaveProperty("bioText");
    expect(rows.Advisor[1]).not.toHaveProperty("businessEmail");
    expect(rows.AdvisorResearchCheck[1]).toMatchObject({
      sourcesChecked: [],
    });
  });
});
