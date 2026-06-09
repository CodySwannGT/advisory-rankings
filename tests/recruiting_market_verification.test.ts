import { describe, expect, it } from "vitest";

import {
  assertRecruitingMarketVerification,
  recruitingMarketFilterPaths,
  recruitingRoutePath,
  summarizeRecruitingMarketPayload,
  type RecruitingMarketVerificationEvidence,
} from "../src/lib/recruiting-market-verification.js";

const MISSING_TOTAL_PCT_T12 = "missing-total-pct-t12";
const MISSING_CLAWBACK_TERMS = "missing-clawback-terms";
const NY_RESOURCE_PATH = "/RecruitingMarket?state=NY&limit=25";

const PAYLOAD = {
  firmMomentum: [{ firm: "A" }, { firm: "B" }],
  marketActivity: [{ market: "New York, NY" }, { market: "Palo Alto, CA" }],
  recentMoves: [
    {
      id: "move-1",
      location: { state: "NY" },
      moveDate: "2026-01-15T00:00:00.000Z",
      sourceStatus: [
        "source-backed",
        MISSING_TOTAL_PCT_T12,
        MISSING_CLAWBACK_TERMS,
      ],
    },
    {
      id: "move-2",
      location: { state: "CA" },
      moveDate: "2026-02-15T00:00:00.000Z",
      sourceStatus: ["source-backed"],
    },
  ],
};

describe("recruiting market verification", () => {
  it("summarizes RecruitingMarket payloads for replay evidence", () => {
    expect(summarizeRecruitingMarketPayload(PAYLOAD)).toMatchObject({
      firmMomentumCount: 2,
      marketActivityCount: 2,
      missingFieldStatuses: [MISSING_CLAWBACK_TERMS, MISSING_TOTAL_PCT_T12],
      recentMoveCount: 2,
      sampleMarkets: ["New York, NY", "Palo Alto, CA"],
    });
  });

  it("builds filtered resource and route paths from representative rows", () => {
    expect(recruitingMarketFilterPaths(PAYLOAD)).toEqual([
      NY_RESOURCE_PATH,
      "/RecruitingMarket?year=2026&limit=25",
    ]);
    expect(recruitingRoutePath(NY_RESOURCE_PATH)).toBe(
      "/recruiting?state=NY&limit=25"
    );
  });

  it("requires multiple moves, multiple markets, browser tables, and source statuses", () => {
    expect(() =>
      assertRecruitingMarketVerification(evidence({ recentMoveCount: 1 }))
    ).toThrow(/default recent moves 1 < 2/);
    expect(() =>
      assertRecruitingMarketVerification(evidence({ marketActivityCount: 1 }))
    ).toThrow(/default market activity rows 1 < 2/);
    expect(() =>
      assertRecruitingMarketVerification(evidence({ missingFieldStatuses: [] }))
    ).toThrow(/missing source statuses/);
    expect(() => assertRecruitingMarketVerification(evidence())).not.toThrow();
  });
});

/**
 * Builds complete evidence with optional default-resource overrides.
 * @param overrides - Default resource fields to replace.
 * @returns Verification evidence fixture.
 */
function evidence(
  overrides: Partial<
    RecruitingMarketVerificationEvidence["defaultResource"]
  > = {}
): RecruitingMarketVerificationEvidence {
  return {
    browser: [
      {
        screenshot: "tests/screenshots/recruiting-market-verification.png",
        sourceStatusText: "Total T-12 unavailable Clawback terms unavailable",
        summaryText: "Moves 2",
        tableCount: 2,
        viewport: "desktop",
      },
    ],
    capturedAt: "2026-06-09T00:00:00.000Z",
    dataBaseUrl: "https://example.test",
    defaultResource: {
      firmMomentumCount: 2,
      marketActivityCount: 2,
      missingFieldStatuses: [MISSING_CLAWBACK_TERMS, MISSING_TOTAL_PCT_T12],
      recentMoveCount: 2,
      sampleMarkets: [],
      sampleMoves: [],
      ...overrides,
    },
    filters: [
      {
        label: "/recruiting?state=NY&limit=25",
        marketActivityCount: 1,
        path: NY_RESOURCE_PATH,
        recentMoveCount: 1,
      },
    ],
    localUrl: "http://127.0.0.1:12345",
  };
}
