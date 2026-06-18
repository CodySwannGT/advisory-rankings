import { describe, expect, it } from "vitest";
import {
  detectUnextractedRecruiting,
  unextractedRecruitingWarnings,
} from "../src/lib/data-coverage-recruiting-gap.js";

describe("detectUnextractedRecruiting", () => {
  it("coerces sparse rows and keeps only unlinked recruiting-shaped articles", async () => {
    const result = await detectUnextractedRecruiting(async query => {
      if (query.includes("data.ArticleTransitionEventMention")) {
        return [{ articleId: "linked" }, { articleId: null }, {}];
      }
      return [
        {
          id: "gap",
          headline: null,
          category: "recruiting",
        },
        {
          id: "linked",
          headline: "Wells Fargo Recruits Advisor",
          category: "unknown",
        },
        {
          id: null,
          headline: "Market Commentary",
          category: null,
        },
      ];
    });

    expect(result).toEqual({
      rows: [{ id: "gap", headline: null }],
      warnings: [],
    });
  });

  it("returns recoverable warning lines when either gap query fails", async () => {
    const result = await detectUnextractedRecruiting(async query => {
      if (query.includes("data.ArticleTransitionEventMention")) {
        throw new Error("mentions failed\nwith details");
      }
      throw new Error("articles failed\nwith details");
    });

    expect(result.rows).toEqual([]);
    expect(result.warnings).toEqual([
      "Error: articles failed",
      "Error: mentions failed",
    ]);
  });
});

describe("unextractedRecruitingWarnings", () => {
  it("omits the warning when every recruiting article is linked", () => {
    expect(unextractedRecruitingWarnings([])).toEqual([]);
  });

  it("formats a bounded sample and falls back to ids for missing headlines", () => {
    expect(
      unextractedRecruitingWarnings([
        { id: "a1", headline: "Firm Snags Team" },
        { id: "a2", headline: null },
        { id: "a3", headline: "Advisor Joins RIA" },
        { id: "a4", headline: "Ignored fourth sample" },
      ])
    ).toEqual([
      "recruiting extraction gap: 4 recruiting-shaped article(s) have no linked move (e.g. Firm Snags Team; a2; Advisor Joins RIA)",
    ]);
  });
});
