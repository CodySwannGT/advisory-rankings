import { describe, expect, it } from "vitest";
import {
  parseWellsFargoBranchAdvisors,
  parseWellsFargoLocatorBranches,
} from "../src/lib/wells-fargo-html.js";

describe("parseWellsFargoLocatorBranches", () => {
  it("normalizes branch locator rows with address, contact, and encoded URLs", () => {
    expect(
      parseWellsFargoLocatorBranches(
        `
          <table>
            <tr>
              <td class="tableData">
                <strong><a href="/branch/detail&#58;123">1. Wells Fargo Boston</a></strong>
                Map and Directions
                100 State St
                Boston,
                MA
                02109
              </td>
              <td class="tableData"></td>
              <td class="tableData">
                Phone: (617) 555-0100
                Toll Free: (800) 555-0101
                Fax: (617) 555-0102
              </td>
            </tr>
          </table>
        `,
        "https://fa.wellsfargoadvisors.com/search"
      )
    ).toEqual([
      {
        address: "100 State St",
        branchUrl: "https://fa.wellsfargoadvisors.com/branch/detail:123",
        city: "Boston",
        fax: "6175550102",
        name: "Wells Fargo Boston",
        phone: "6175550100",
        postalCode: "02109",
        state: "MA",
        tollFree: "8005550101",
      },
    ]);
  });

  it("drops malformed rows and keeps partial rows when address parsing fails", () => {
    expect(
      parseWellsFargoLocatorBranches(
        `
          <table>
            <tr><td class="tableData">too few cells</td></tr>
            <tr>
              <td class="tableData"><strong><a>2. Wells Fargo Unknown</a></strong>No postal code</td>
              <td class="tableData"></td>
              <td class="tableData">Phone: (212) 555-0100</td>
            </tr>
          </table>
        `,
        "https://fa.wellsfargoadvisors.com/search"
      )
    ).toEqual([
      {
        branchUrl: undefined,
        name: "Wells Fargo Unknown",
        phone: "2125550100",
        tollFree: undefined,
        fax: undefined,
      },
    ]);
  });
});

describe("parseWellsFargoBranchAdvisors", () => {
  it("merges branch page variables over locator fallback and filters nameless advisors", () => {
    expect(
      parseWellsFargoBranchAdvisors(
        `
          <script>
            var branchName = "Boston Wealth";
            var branchAddress1 = "100 State St";
            var branchAddress3 = "Suite 10";
            var branchCity = "Boston";
            var branchState = "MA";
            var branchZip = "02109";
            var branchCode = "BOS";
            var subfirm = "WFA";
            var phone = "6175550100";
            var tollFree = "";
            var fax = "6175550102";
          </script>
          <ul id="ourFAs">
            <li><a href="/fa/jane-advisor">Jane Advisor</a></li>
            <li><a href="/fa/blank"></a></li>
          </ul>
        `,
        "https://fa.wellsfargoadvisors.com/boston",
        {
          name: "Fallback",
          phone: "(000) 000-0000",
        }
      )
    ).toEqual([
      {
        advisorName: "Jane Advisor",
        advisorUrl: "https://fa.wellsfargoadvisors.com/fa/jane-advisor",
        branch: {
          address: "100 State St, Suite 10",
          branchCode: "BOS",
          branchUrl: "https://fa.wellsfargoadvisors.com/boston",
          city: "Boston",
          fax: "6175550102",
          name: "Boston Wealth",
          phone: "6175550100",
          postalCode: "02109",
          state: "MA",
          subfirm: "WFA",
        },
      },
    ]);
  });
});
