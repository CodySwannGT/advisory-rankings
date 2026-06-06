import { describe, expect, it } from "vitest";

import { summarizeResourcePayload } from "../src/scripts/capture_data_depth_baseline.js";

const EXAMPLE_WEALTH = "Example Wealth";
const BETA_ADVISORS = "Beta Advisors";
const SOURCE_BACKED = "source-backed";

describe("data-depth baseline evidence", () => {
  it("summarizes recruiting resource depth without storing full payloads", () => {
    const summary = summarizeResourcePayload("recruiting", {
      summary: { totalMoves: 2, sourceBackedMoves: 1 },
      marketActivity: [{ state: "NY" }],
      firmMomentum: [{ firm: "Example Wealth" }],
      recentMoves: [
        {
          id: "move-1",
          subject: "Avery Stone",
          fromFirm: EXAMPLE_WEALTH,
          toFirm: BETA_ADVISORS,
          sourceStatus: [SOURCE_BACKED],
          provenance: ["article-1"],
          body: "full article text omitted",
        },
      ],
    });

    expect(summary).toEqual({
      summary: { totalMoves: 2, sourceBackedMoves: 1 },
      recentMoveCount: 1,
      marketActivityCount: 1,
      firmMomentumCount: 1,
      sampleRecentMoves: [
        {
          id: "move-1",
          subject: "Avery Stone",
          fromFirm: EXAMPLE_WEALTH,
          toFirm: BETA_ADVISORS,
          sourceStatus: [SOURCE_BACKED],
          provenance: ["article-1"],
        },
      ],
    });
  });

  it("summarizes directory and feed pagination evidence", () => {
    expect(
      summarizeResourcePayload("firms", {
        total: 7,
        count: 2,
        nextCursor: "cursor-1",
        items: [
          { name: EXAMPLE_WEALTH, slug: "example-wealth", id: "firm-1" },
          { name: BETA_ADVISORS, slug: "beta-advisors", id: "firm-2" },
        ],
      })
    ).toEqual({
      total: 7,
      count: 2,
      itemCount: 2,
      nextCursorPresent: true,
      sampleItems: [
        { name: EXAMPLE_WEALTH, slug: "example-wealth" },
        { name: BETA_ADVISORS, slug: "beta-advisors" },
      ],
    });

    expect(
      summarizeResourcePayload("feed", {
        total: 9,
        count: 1,
        items: [{ id: "article-1", title: "Advisor move", category: "news" }],
      })
    ).toMatchObject({
      total: 9,
      count: 1,
      itemCount: 1,
      nextCursorPresent: false,
    });
  });
});
