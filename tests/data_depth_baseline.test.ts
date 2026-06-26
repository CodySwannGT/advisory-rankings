import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureDataDepthBaseline,
  summarizeResourcePayload,
  validateRecruitingMarketDepth,
} from "../src/scripts/capture_data_depth_baseline.js";

const EXAMPLE_WEALTH = "Example Wealth";
const BETA_ADVISORS = "Beta Advisors";
const SOURCE_BACKED = "source-backed";
const MISSING_DEAL_TERMS = "missing-deal-terms";

describe("data-depth baseline evidence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("summarizes recruiting resource depth without storing full payloads", () => {
    const summary = summarizeResourcePayload("recruiting", {
      summary: { totalMoves: 2, sourceBackedMoves: 1 },
      sourceCoverage: {
        moveCount: 2,
        sourceBackedCount: 1,
        missingAumCount: 1,
        statusCounts: [{ status: MISSING_DEAL_TERMS, count: 1 }],
      },
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

    expect(summary).toMatchObject({
      summary: { totalMoves: 2, sourceBackedMoves: 1 },
      recentMoveCount: 2,
      marketActivityCount: 1,
      firmMomentumCount: 1,
      sourceBackedCount: 1,
      sourceCoveragePercent: 50,
      knownAumCount: 1,
      missingAumCount: 1,
      missingDealEconomicsStatusCount: 1,
      sourceStatusTags: [SOURCE_BACKED],
      missingFieldTags: [],
      filterSlices: {
        directions: [],
        firmIds: [],
        states: [],
      },
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
      validationReport: {
        passCount: 4,
        failCount: 3,
        checks: [
          {
            id: "move-depth",
            actual: 2,
            expectedMinimum: 25,
            passed: false,
          },
          {
            id: "market-depth",
            actual: 1,
            expectedMinimum: 10,
            passed: false,
          },
          {
            id: "directional-slices",
            actual: 0,
            expectedMinimum: 2,
            passed: false,
          },
          {
            id: "source-backed-rows",
            actual: 1,
            expectedMinimum: 1,
            passed: true,
          },
          {
            id: "known-aum-rows",
            actual: 1,
            expectedMinimum: 1,
            passed: true,
          },
          {
            id: "unknown-aum-rows",
            actual: 1,
            expectedMinimum: 1,
            passed: true,
          },
          {
            id: "missing-deal-economics-statuses",
            actual: 1,
            expectedMinimum: 1,
            passed: true,
          },
        ],
      },
    });
  });

  it("validates source-backed RecruitingMarket depth thresholds", () => {
    const summary = validateRecruitingMarketDepth({
      summary: { count: 25 },
      marketActivity: Array.from({ length: 10 }, (_, index) => ({
        market: `Market ${index}`,
      })),
      firmMomentum: Array.from({ length: 8 }, (_, index) => ({
        firm: { id: `firm-${index}` },
      })),
      recentMoves: Array.from({ length: 25 }, (_, index) =>
        recruitingMove(index)
      ),
    });

    expect(summary).toMatchObject({
      recentMoveCount: 25,
      marketActivityCount: 10,
      firmMomentumCount: 8,
      sourceBackedCount: 24,
      sourceCoveragePercent: 96,
      knownAumCount: 24,
      missingAumCount: 1,
      missingDealEconomicsStatusCount: 1,
      missingFieldTags: ["missing-aum", "missing-deal-terms", "missing-source"],
      filterSlices: {
        directions: ["inbound", "outbound"],
        firmIds: [
          "from-0",
          "from-1",
          "from-2",
          "from-3",
          "to-0",
          "to-1",
          "to-2",
          "to-3",
        ],
        states: ["CA", "NY"],
      },
      validationReport: {
        passCount: 7,
        failCount: 0,
      },
    });
  });

  it("fails RecruitingMarket depth validation when useful slices are missing", () => {
    expect(() =>
      validateRecruitingMarketDepth({
        summary: { count: 1 },
        marketActivity: [{ market: "New York, NY" }],
        firmMomentum: [{ firm: { id: "firm-1" } }],
        recentMoves: [recruitingMove(0)],
      })
    ).toThrow(
      "RecruitingMarket depth check failed: moves 1 < 25; firm momentum rows 1 < 8; market activity rows 1 < 10; source coverage percent 0 < 1; state filter slices 1 < 2; firm filter slices 2 < 4"
    );
  });

  it("captures a recruiting validation failure in the report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes("/RecruitingMarket")
            ? {
                summary: { count: 1 },
                sourceCoverage: {
                  moveCount: 1,
                  sourceBackedCount: 1,
                  missingAumCount: 1,
                  statusCounts: [{ status: MISSING_DEAL_TERMS, count: 1 }],
                },
                marketActivity: [{ market: "New York, NY" }],
                firmMomentum: [{ firm: { id: "firm-1" } }],
                recentMoves: [recruitingMove(0)],
              }
            : { items: [] },
      }))
    );

    const report = await captureDataDepthBaseline({
      baseUrl: "https://example.test",
      out: "unused.json",
      stdout: false,
    });

    expect(report.endpoints[0]).toMatchObject({
      name: "recruiting",
      ok: false,
      validationPassed: false,
      summary: {
        validationReport: {
          passCount: 4,
          failCount: 3,
        },
      },
    });
    expect(report.endpoints[0]?.summary.validationError).toMatch(
      /moves 1 < 25/
    );
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

/**
 * Builds one compact RecruitingMarket move for data-depth validation tests.
 * @param index - Row index used to vary firms, states, and source status.
 * @returns A move-shaped object with public resource fields.
 */
function recruitingMove(index: number): object {
  return {
    id: `move-${index}`,
    subject: `Move ${index}`,
    fromFirm: { id: `from-${index % 4}`, name: `From ${index % 4}` },
    toFirm: { id: `to-${index % 4}`, name: `To ${index % 4}` },
    location: { state: index % 2 === 0 ? "NY" : "CA" },
    sourceStatus:
      index === 0
        ? ["missing-source", "missing-aum", MISSING_DEAL_TERMS]
        : [SOURCE_BACKED],
    provenance: { sourceIds: [`transition-${index}`] },
  };
}
