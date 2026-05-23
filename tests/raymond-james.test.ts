import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildRaymondJamesSearchUrl,
  emptyRaymondJamesRows,
  mapRaymondJamesAdvisors,
  parseRaymondJamesBranch,
  parseRaymondJamesBranchMarkdown,
  RAYMOND_JAMES_MANHATTAN_BRANCH_URL,
  RAYMOND_JAMES_SOURCE_ADAPTER,
} from "../src/lib/raymond-james.js";

const fixture = (name: string): string =>
  readFileSync(`tests/fixtures/firm-sources/raymond-james/${name}`, "utf8");
const TAMPA_BRANCH_URL = "https://www.raymondjames.com/tampa";

describe("Raymond James source adapter", () => {
  it("documents public branch roster discovery", () => {
    expect(
      buildRaymondJamesSearchUrl({ input: "10022", limit: 5, offset: 10 })
    ).toBe(
      "https://www.raymondjames.com/find-an-advisor?citystatezip=10022&lastname=&limit=5&offset=10"
    );
    expect(RAYMOND_JAMES_SOURCE_ADAPTER.buildSearchUrl("10022", 1, 2)).toBe(
      "https://www.raymondjames.com/find-an-advisor?citystatezip=10022&lastname=&limit=1&offset=2"
    );
    expect(RAYMOND_JAMES_SOURCE_ADAPTER.discover()).toMatchObject({
      locatorUrl: "https://www.raymondjames.com/find-an-advisor",
      feedUrl: RAYMOND_JAMES_MANHATTAN_BRANCH_URL,
      requestShape: expect.stringContaining("public branch roster pages"),
    });
  });

  it("parses branch metadata from public roster markdown", () => {
    const branch = parseRaymondJamesBranch(
      fixture("branch.md"),
      RAYMOND_JAMES_MANHATTAN_BRANCH_URL
    );
    expect(branch).toMatchObject({
      name: "Manhattan Branch",
      address: "320 Park Ave Fl 9",
      city: "New York",
      state: "NY",
      postalCode: "10022",
      phone: "2123140484",
    });
  });

  it("parses advisor roster entries with provenance fields", () => {
    const advisors = parseRaymondJamesBranchMarkdown(
      fixture("branch.md"),
      RAYMOND_JAMES_MANHATTAN_BRANCH_URL
    );
    expect(advisors).toHaveLength(4);
    expect(advisors[0]).toMatchObject({
      advisorName: "Richard Sunwoo",
      roleTitle: "Managing Director",
      businessEmail: "Richard.Sunwoo@RaymondJames.com",
      businessPhone: "12123140486",
      branch: { name: "Manhattan Branch" },
    });
    expect(advisors[1]).toMatchObject({
      advisorName: "Christopher Swanson, CFA®",
      roleTitle: "Senior Investment Portfolio Analyst",
    });
  });

  it("maps parsed advisors to Harper source rows", () => {
    const rows = mapRaymondJamesAdvisors(
      parseRaymondJamesBranchMarkdown(
        fixture("branch.md"),
        RAYMOND_JAMES_MANHATTAN_BRANCH_URL
      ),
      "2026-05-23"
    );
    expect(rows.Firm).toHaveLength(1);
    expect(rows.Branch).toHaveLength(1);
    expect(rows.Advisor).toHaveLength(4);
    expect(rows.EmploymentHistory[0]).toMatchObject({
      sourceType: "raymond_james_branch_roster",
      roleTitle: "Managing Director",
    });
    expect(rows.AdvisorResearchCheck[0].sourcesChecked).toContain(
      RAYMOND_JAMES_MANHATTAN_BRANCH_URL
    );
  });

  it("handles partial roster markdown without contact details", () => {
    const advisors = parseRaymondJamesBranchMarkdown(
      `# Sample Office of Raymond James - Tampa, FL

No contact line here.

[![Image 1](/dotcom/headshot?id=1) Jane Example Wealth Strategist View Website](/sample/bio?_=Jane.Example)

`,
      "https://www.raymondjames.com/sample"
    );
    expect(advisors).toEqual([
      {
        advisorName: "Jane Example Wealth Strategist",
        roleTitle: undefined,
        advisorUrl: "https://www.raymondjames.com/sample/bio?_=Jane.Example",
        headshotUrl: "https://www.raymondjames.com/dotcom/headshot?id=1",
        businessEmail: undefined,
        businessPhone: undefined,
        branch: {
          name: "Sample Office",
          branchUrl: "https://www.raymondjames.com/sample",
          address: undefined,
          city: undefined,
          state: undefined,
          postalCode: undefined,
          phone: undefined,
        },
      },
    ]);
  });

  it("covers fallback address and empty mapping branches", () => {
    const branch = parseRaymondJamesBranch(
      `# Tampa Branch of Raymond James - Tampa, FL

*    Raymond James Financial 100 N Tampa St Tampa, FL 33602[T: office](tel:office)
`,
      TAMPA_BRANCH_URL
    );
    expect(branch).toMatchObject({
      address: "100 N Tampa St",
      city: "Tampa",
      state: "FL",
      postalCode: "33602",
      phone: undefined,
    });
    expect(emptyRaymondJamesRows().Advisor).toEqual([]);
    expect(
      mapRaymondJamesAdvisors([
        {
          advisorName: "",
          branch,
        },
      ])
    ).toMatchObject({ Advisor: [] });
    const fallbackRows = mapRaymondJamesAdvisors([
      {
        advisorName: "No Url Advisor",
        branch,
      },
    ]);
    expect(fallbackRows.EmploymentHistory[0]).toMatchObject({
      roleTitle: "Financial Advisor",
      sourceRef: TAMPA_BRANCH_URL,
    });
    expect(fallbackRows.AdvisorResearchCheck[0].sourcesChecked).toEqual([
      TAMPA_BRANCH_URL,
    ]);
  });

  it("normalizes relative links without leading slashes", () => {
    const advisors = parseRaymondJamesBranchMarkdown(
      `# Link Branch of Raymond James - Tampa, FL

*    Raymond James Financial 100 N Tampa St Tampa, FL 33602[T: 813.555.1212](tel:8135551212)

[![Image 1](dotcom/headshot?id=1) Link Advisor Financial Advisor View Website](sample/bio?_=Link.Advisor)

[](mailto:Link.Advisor@RaymondJames.com)
`,
      "https://www.raymondjames.com/link"
    );
    expect(advisors[0]).toMatchObject({
      advisorUrl: "https://www.raymondjames.com/sample/bio?_=Link.Advisor",
      headshotUrl: "https://www.raymondjames.com/dotcom/headshot?id=1",
    });
  });
});
