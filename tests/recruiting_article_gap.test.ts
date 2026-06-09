import { describe, expect, it } from "vitest";
import {
  deriveArticleCategory,
  findUnextractedRecruitingArticles,
  isRecruitingShapedArticle,
  isRecruitingShapedHeadline,
} from "../src/lib/recruiting-article-gap.js";

describe("isRecruitingShapedHeadline", () => {
  it("matches the Raymond James / City National move headline", () => {
    expect(
      isRecruitingShapedHeadline(
        "Raymond James Snags $7M Team From RBC’s City National in California"
      )
    ).toBe(true);
  });

  it.each([
    "Wells Fargo Recruits $1B Advisor From UBS",
    "Veteran Advisor Joins Rockefeller",
    "Morgan Stanley Lands Breakaway Team",
    "RIA Poaches Duo From Merrill",
    "Stifel Hires Texas Group",
    "Firm Nabs $500M Practice",
    "Advisor Jumps to LPL",
  ])("flags recruiting verb headline: %s", headline => {
    expect(isRecruitingShapedHeadline(headline)).toBe(true);
  });

  it.each([
    "Q1 Market Commentary: Rates and Inflation",
    "SEC Proposes New Custody Rule",
    "Firm Reports Record Quarterly Earnings",
    "",
  ])("does not flag non-move headline: %s", headline => {
    expect(isRecruitingShapedHeadline(headline)).toBe(false);
  });

  it("handles null and undefined", () => {
    expect(isRecruitingShapedHeadline(null)).toBe(false);
    expect(isRecruitingShapedHeadline(undefined)).toBe(false);
  });

  it("does not match recruiting verbs embedded in other words", () => {
    expect(isRecruitingShapedHeadline("Highlands Bank Earnings")).toBe(false);
    expect(isRecruitingShapedHeadline("Enjoined By Regulators")).toBe(false);
  });
});

describe("isRecruitingShapedArticle", () => {
  it("treats an explicit recruiting category as shaped regardless of headline", () => {
    expect(
      isRecruitingShapedArticle({
        headline: "Quarterly Earnings Update",
        category: "recruiting",
      })
    ).toBe(true);
  });

  it("falls back to the headline heuristic when category is generic", () => {
    expect(
      isRecruitingShapedArticle({
        headline: "Firm Snags Team",
        category: "unknown",
      })
    ).toBe(true);
    expect(
      isRecruitingShapedArticle({
        headline: "Earnings Update",
        category: "unknown",
      })
    ).toBe(false);
  });
});

describe("deriveArticleCategory", () => {
  it("labels recruiting-shaped headlines as recruiting", () => {
    expect(deriveArticleCategory("Raymond James Snags $7M Team")).toBe(
      "recruiting"
    );
  });

  it("returns unknown for non-move headlines with no prior category", () => {
    expect(deriveArticleCategory("Market Commentary")).toBe("unknown");
  });

  it("preserves an existing meaningful category", () => {
    expect(deriveArticleCategory("Firm Snags Team", "disclosure")).toBe(
      "disclosure"
    );
  });

  it("upgrades the unknown placeholder when the headline reads like a move", () => {
    expect(deriveArticleCategory("Advisor Joins Firm", "unknown")).toBe(
      "recruiting"
    );
  });
});

describe("findUnextractedRecruitingArticles", () => {
  const articles = [
    {
      id: "a1",
      headline: "Raymond James Snags $7M Team From RBC",
      category: "unknown",
    },
    { id: "a2", headline: "Wells Fargo Recruits Advisor", category: "unknown" },
    { id: "a3", headline: "Quarterly Earnings Update", category: "unknown" },
  ];

  it("returns recruiting-shaped articles with no transition mention", () => {
    const gap = findUnextractedRecruitingArticles(articles, new Set(["a2"]));
    expect(gap.map(article => article.id)).toEqual(["a1"]);
  });

  it("excludes non-recruiting articles even with no mention", () => {
    const gap = findUnextractedRecruitingArticles(articles, new Set());
    expect(gap.map(article => article.id)).toEqual(["a1", "a2"]);
  });

  it("returns nothing when every move article is already linked", () => {
    const gap = findUnextractedRecruitingArticles(
      articles,
      new Set(["a1", "a2"])
    );
    expect(gap).toEqual([]);
  });
});
