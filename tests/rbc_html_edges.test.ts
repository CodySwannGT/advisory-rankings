import { describe, expect, it } from "vitest";
import {
  parseRbcAdvisors,
  parseRbcBranches,
  parseRbcNonce,
} from "../src/lib/rbc-html.js";
import type { RbcBranchSource } from "../src/lib/rbc-types.js";

describe("parseRbcNonce", () => {
  it("returns undefined when the finder page omits the AJAX nonce", () => {
    expect(
      parseRbcNonce("<script>window.config = {}</script>")
    ).toBeUndefined();
  });
});

describe("parseRbcBranches", () => {
  it("normalizes full state names in parsed branch addresses", () => {
    expect(
      parseRbcBranches(`
        <div class="rbcwm-advisors-branch-advisors-expandable-trigger">
          <button class="rbcwm-advisors-branch-advisors-expandable-btn" data-branch_id="br-1"></button>
          <h3>RBC Boston</h3>
          <a href="/wealth-management/boston">Profile</a>
          <span class="category">2 miles</span>
          <address>100 State St, Boston, Massachusetts, 02109</address>
        </div>
      `)
    ).toEqual([
      {
        address: "100 State St",
        branchId: "br-1",
        branchUrl: "/wealth-management/boston",
        city: "Boston",
        distance: "2 miles",
        name: "RBC Boston",
        postalCode: "02109",
        state: "Massachusetts",
      },
    ]);
  });

  it("drops branch rows that do not include a branch id or name", () => {
    expect(
      parseRbcBranches(`
        <div class="rbcwm-advisors-branch-advisors-expandable-trigger">
          <h3>Missing Identifier</h3>
        </div>
        <div class="rbcwm-advisors-branch-advisors-expandable-trigger">
          <button class="rbcwm-advisors-branch-advisors-expandable-btn" data-branch_id="br-2"></button>
        </div>
      `)
    ).toEqual([]);
  });
});

describe("parseRbcAdvisors", () => {
  const branch: RbcBranchSource = {
    branchId: "br-1",
    name: "RBC Austin",
  };

  it("normalizes advisor links, contacts, and background headshots", () => {
    expect(
      parseRbcAdvisors(
        `
          <div class="rbc-caption">
            <div style="background-image: url(/photo.jpg)"></div>
            <div class="rbc-caption-text">
              <h3>Jane Advisor</h3>
              <a href="tel:+1 (512) 555-0100">Call</a>
              <a href="mailto:jane@example.com">Email</a>
              <a href="/jane-advisor">Profile</a>
            </div>
          </div>
        `,
        branch
      )
    ).toEqual([
      {
        advisorName: "Jane Advisor",
        advisorUrl: "/jane-advisor",
        branch,
        businessEmail: "jane@example.com",
        businessPhone: "+1 (512) 555-0100",
        headshotUrl: "/photo.jpg",
      },
    ]);
  });

  it("drops nameless advisor rows and keeps optional links undefined", () => {
    expect(
      parseRbcAdvisors(
        `
          <div class="rbc-caption"><div class="rbc-caption-text"><h3></h3></div></div>
          <div class="rbc-caption"><div class="rbc-caption-text"><h3>Sam Advisor</h3></div></div>
        `,
        branch
      )
    ).toEqual([
      {
        advisorName: "Sam Advisor",
        advisorUrl: undefined,
        branch,
        businessEmail: undefined,
        businessPhone: undefined,
        headshotUrl: undefined,
      },
    ]);
  });
});
