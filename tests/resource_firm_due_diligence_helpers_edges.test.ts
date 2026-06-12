import { describe, expect, it } from "vitest";

import {
  coverageTimelineModule,
  dataConfidenceModule,
  rankingPresenceModule,
  rankingRows,
  regulatorySnapshotModule,
  recruitingMomentumModule,
  rosterFootprintModule,
} from "../src/harper/resource-firm-due-diligence-helpers.js";

const emptyProfile = {
  currentAdvisorCount: 0,
  pastAdvisorCount: 0,
  currentTeams: [],
  branches: [],
  brokerCheckSnapshot: null,
};

const emptyDb = {
  employments: [],
  teams: [],
  rankingEntries: [],
  byRanking: new Map(),
};

describe("firm due diligence helper edge cases", () => {
  it("reports empty roster and transition modules as explicit no-data states", () => {
    expect(rosterFootprintModule(emptyProfile as any)).toMatchObject({
      status: "not_found",
      currentAdvisorCount: 0,
      pastAdvisorCount: 0,
      teamCount: 0,
      branchCount: 0,
      freshness: expect.objectContaining({ status: "unavailable" }),
    });

    expect(recruitingMomentumModule("firm-a")).toMatchObject({
      status: "not_found",
      inbound: { count: 0, knownAum: 0, unknownAumCount: 0 },
      outbound: { count: 0, knownAum: 0, unknownAumCount: 0 },
      netMoveCount: 0,
      netAumMoved: 0,
      recentMoves: [],
      provenance: { sourceIds: [] },
      freshness: expect.objectContaining({ status: "unavailable" }),
    });
  });

  it("infers ranking subjects and preserves unresolved rows without a ranking lookup", () => {
    const db = {
      ...emptyDb,
      rankingEntries: [
        { id: "entry-firm", rankingId: "missing", subjectFirmId: "firm-a" },
        { id: "entry-team", rankingId: "missing", subjectTeamId: "team-a" },
        {
          id: "entry-advisor",
          rankingId: "missing",
          subjectAdvisorId: "advisor-a",
        },
        { id: "entry-unresolved", rankingId: "missing" },
      ],
    };

    expect(
      rankingPresenceModule(db as any, db.rankingEntries as any)
    ).toMatchObject({
      status: "loaded",
      resolvedCount: 0,
      unresolvedCount: 4,
      topRank: null,
      appearances: [
        { id: "entry-firm", subjectType: "firm", ranking: null },
        { id: "entry-team", subjectType: "team", ranking: null },
        { id: "entry-advisor", subjectType: "advisor", ranking: null },
        { id: "entry-unresolved", subjectType: "unresolved", ranking: null },
      ],
    });
  });

  it("selects ranking rows through firm, advisor, and team relationships", () => {
    const db = {
      ...emptyDb,
      employments: [
        { firmId: "firm-a", advisorId: "advisor-a" },
        { firmId: "firm-a", advisorId: "" },
        { firmId: "firm-b", advisorId: "advisor-b" },
      ],
      teams: [
        { id: "team-a", currentFirmId: "firm-a" },
        { id: "", currentFirmId: "firm-a" },
        { id: "team-b", currentFirmId: "firm-b" },
      ],
      rankingEntries: [
        { id: "direct", subjectFirmId: "firm-a" },
        { id: "advisor", subjectAdvisorId: "advisor-a" },
        { id: "team", subjectTeamId: "team-a" },
        { id: "other", subjectAdvisorId: "advisor-b" },
      ],
    };

    expect(rankingRows(db as any, "firm-a").map(row => row.id)).toEqual([
      "direct",
      "advisor",
      "team",
    ]);
  });

  it("normalizes nullable regulatory and coverage provenance fields", () => {
    expect(
      regulatorySnapshotModule({
        id: "",
        fetchedAt: null,
        subjectCrd: null,
      } as any)
    ).toMatchObject({
      status: "loaded",
      source: expect.objectContaining({
        compiledAsOf: null,
        sourceUrl: "https://brokercheck.finra.org/",
      }),
      provenance: { sourceIds: [] },
      freshness: expect.objectContaining({ status: "unavailable" }),
    });

    expect(coverageTimelineModule()).toMatchObject({
      status: "not_found",
      articleCount: 0,
      provenance: { sourceIds: [] },
      freshness: expect.objectContaining({ status: "unavailable" }),
    });
  });

  it("summarizes module confidence when no source module is loaded", () => {
    expect(
      dataConfidenceModule({
        rosterFootprint: rosterFootprintModule(emptyProfile as any),
        coverageTimeline: coverageTimelineModule(),
        regulatorySnapshot: regulatorySnapshotModule(null),
      } as any)
    ).toMatchObject({
      status: "unavailable",
      modules: [
        expect.objectContaining({ name: "rosterFootprint" }),
        expect.objectContaining({ name: "coverageTimeline" }),
        expect.objectContaining({ name: "regulatorySnapshot" }),
      ],
    });
  });
});
