import { describe, expect, it } from "vitest";
import { emptyRbcRows, mapRbcAdvisors } from "../src/lib/rbc-rows.js";
import { emptyStifelRows, mapStifelAdvisors } from "../src/lib/stifel-rows.js";
import {
  emptyWellsFargoRows,
  mapWellsFargoAdvisors,
} from "../src/lib/wells-fargo-rows.js";
import type { RbcAdvisorSource } from "../src/lib/rbc-types.js";
import type { StifelAdvisorSource } from "../src/lib/stifel-types.js";
import type { WellsFargoAdvisorSource } from "../src/lib/wells-fargo-types.js";

describe("firm source row mapper edges", () => {
  it("returns reusable empty row bundles for scraper aggregation", () => {
    expect(emptyRbcRows()).toMatchObject({ Firm: [], Advisor: [] });
    expect(emptyStifelRows()).toMatchObject({ Firm: [], Advisor: [] });
    expect(emptyWellsFargoRows()).toMatchObject({ Firm: [], Advisor: [] });
  });

  it("uses the default checked date for mapped RBC rows", () => {
    const advisor: RbcAdvisorSource = {
      advisorName: "Riley Branch",
      branch: {
        branchId: "nyc-1",
        name: "New York",
        city: "New York",
        state: "NY",
      },
    };

    const rows = mapRbcAdvisors([advisor]);

    expect(rows.Advisor).toHaveLength(1);
    expect(rows.AdvisorResearchCheck[0]?.checkedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u
    );
  });

  it("uses the default checked date for mapped Stifel rows", () => {
    const advisor: StifelAdvisorSource = {
      advisorName: "Skyler Stifel",
      branchName: "Chicago",
      searchUrl: "https://www.stifel.com/fa/search?state=il",
    };

    const rows = mapStifelAdvisors([advisor]);

    expect(rows.Advisor).toHaveLength(1);
    expect(rows.AdvisorResearchCheck[0]?.checkedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u
    );
  });

  it("uses the default checked date for mapped Wells Fargo rows", () => {
    const advisor: WellsFargoAdvisorSource = {
      advisorName: "Wynn Fargo",
      branch: {
        name: "Charlotte",
        city: "Charlotte",
        state: "NC",
      },
    };

    const rows = mapWellsFargoAdvisors([advisor]);

    expect(rows.Advisor).toHaveLength(1);
    expect(rows.AdvisorResearchCheck[0]?.checkedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u
    );
  });
});
