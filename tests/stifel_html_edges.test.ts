import { describe, expect, it } from "vitest";
import { parseStifelSearchResults } from "../src/lib/stifel-html.js";

describe("parseStifelSearchResults", () => {
  it("normalizes advisor cards with optional profile, branch, and contact fields", () => {
    expect(
      parseStifelSearchResults(
        `
          <table id="searchResults">
            <tbody>
              <tr>
                <td class="search-results-name">
                  <a class="search-results-fa-link" href="/fa/jane-advisor">Jane Advisor</a>
                  <div>Jane Advisor</div>
                  <div>Managing Director</div>
                  <div>Boston, Massachusetts</div>
                  <div>Contact Jane</div>
                  <div>LinkedIn</div>
                </td>
                <td class="search-results-contact-info">
                  <a class="search-results-branch-link" href="/branch/boston">Boston Branch</a>
                  <div class="search-results-phone-desktop">(617) 555-0100</div>
                  <div class="search-results-phone-desktop">(800) 555-0101</div>
                </td>
                <td>
                  <button class="search-results-email-image" data-fa-name="Jane Advisor" data-fa-url-friendly-name="jane-advisor"></button>
                  <img class="search-results-fa-image" src="/images/jane.jpg" />
                  <a href="https://www.linkedin.com/in/jane-advisor">LinkedIn</a>
                </td>
              </tr>
            </tbody>
          </table>
        `,
        "https://www.stifel.com/search?state=MA"
      )
    ).toEqual([
      {
        advisorName: "Jane Advisor",
        advisorUrl: "https://www.stifel.com/fa/jane-advisor",
        branchName: "Boston Branch",
        branchUrl: "https://www.stifel.com/branch/boston",
        businessPhone: "6175550100",
        city: "Boston",
        emailContactName: "Jane Advisor",
        emailUrlFriendlyName: "jane-advisor",
        headshotUrl: "https://www.stifel.com/images/jane.jpg",
        linkedInUrl: "https://www.linkedin.com/in/jane-advisor",
        roleTitle: "Managing Director",
        searchUrl: "https://www.stifel.com/search?state=MA",
        state: "MA",
        tollFreePhone: "8005550101",
      },
    ]);
  });

  it("drops nameless rows and leaves absent optional fields undefined", () => {
    expect(
      parseStifelSearchResults(
        `
          <table id="searchResults">
            <tbody>
              <tr><td class="search-results-name"><a class="search-results-fa-link"></a></td></tr>
              <tr>
                <td class="search-results-name">
                  <a class="search-results-fa-link">Sam Advisor</a>
                  <div>Sam Advisor</div>
                  <div>San Diego, CA</div>
                </td>
                <td class="search-results-contact-info"></td>
              </tr>
            </tbody>
          </table>
        `,
        "https://www.stifel.com/search?state=CA"
      )
    ).toEqual([
      {
        advisorName: "Sam Advisor",
        advisorUrl: undefined,
        branchName: "",
        branchUrl: undefined,
        businessPhone: undefined,
        city: "",
        emailContactName: "",
        emailUrlFriendlyName: "",
        headshotUrl: undefined,
        linkedInUrl: undefined,
        roleTitle: "San Diego, CA",
        searchUrl: "https://www.stifel.com/search?state=CA",
        state: undefined,
        tollFreePhone: undefined,
      },
    ]);
  });

  it("keeps city-only locations without inventing a state", () => {
    expect(
      parseStifelSearchResults(
        `
          <table id="searchResults">
            <tbody>
              <tr>
                <td class="search-results-name">
                  <a class="search-results-fa-link" href="/fa/pat-advisor">Pat Advisor</a>
                  <div>Pat Advisor</div>
                  <div>Senior Vice President</div>
                  <div>Chicago</div>
                </td>
                <td class="search-results-contact-info"></td>
              </tr>
            </tbody>
          </table>
        `,
        "https://www.stifel.com/search?name=pat"
      )
    ).toEqual([
      expect.objectContaining({
        advisorName: "Pat Advisor",
        city: "Chicago",
        roleTitle: "Senior Vice President",
        state: undefined,
      }),
    ]);
  });
});
