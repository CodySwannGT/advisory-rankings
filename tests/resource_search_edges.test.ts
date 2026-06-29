import { describe, expect, it } from "vitest";

import {
  advisorSearchMatches,
  firmSearchMatches,
  searchCounts,
  teamSearchMatches,
} from "../src/harper/resource-search.js";

const FIRM_ID = "firm-1";
const FIRM_NAME = "Alpha Firm";
const ADVISOR_ID = "advisor-1";
const SECOND_ADVISOR_ID = "advisor-2";

describe("resource search edge scoring", () => {
  it("scores firm names and subtitles across fallback paths", () => {
    const matches = firmSearchMatches(
      [
        {
          id: "firm-exact",
          name: "Alpha Wealth",
          legalName: "",
          hqCity: "New York",
          hqState: "NY",
          channel: "RIA",
        },
        {
          id: "firm-legal",
          name: "Holding Company",
          legalName: "Alpha Legal",
          hqCity: "",
          hqState: "",
          channel: "Wirehouse",
        },
        {
          id: "firm-none",
          name: "Alpha Partners",
          legalName: "",
          hqCity: "",
          hqState: "",
          channel: "",
        },
      ] as never,
      "alpha"
    );

    expect(matches).toEqual([
      expect.objectContaining({
        id: "firm-exact",
        sub: "New York, NY",
        score: 2.5,
      }),
      expect.objectContaining({
        id: "firm-legal",
        sub: "Wirehouse",
        score: 2.5,
      }),
      expect.objectContaining({
        id: "firm-none",
        sub: null,
        score: 2.5,
      }),
    ]);
  });

  it("scores advisors and teams with firm and fallback subtitles", () => {
    const firms = new Map([
      [FIRM_ID, { id: FIRM_ID, name: FIRM_NAME }],
    ]) as never;
    const employments = new Map([
      [ADVISOR_ID, { advisorId: ADVISOR_ID, firmId: FIRM_ID }],
      [
        SECOND_ADVISOR_ID,
        { advisorId: SECOND_ADVISOR_ID, firmId: "missing-firm" },
      ],
    ]) as never;

    const advisorMatches = advisorSearchMatches(
      [
        {
          id: ADVISOR_ID,
          legalName: "Jane Alpha",
          firstName: "Jane",
          lastName: "Advisor",
          preferredName: "",
          careerStatus: "Active",
        },
        {
          id: SECOND_ADVISOR_ID,
          legalName: "Morgan Beta",
          firstName: "Morgan",
          lastName: "",
          preferredName: "Alpha",
          careerStatus: "Former advisor",
        },
        {
          id: "advisor-3",
          legalName: "Alpha Legal",
          firstName: "",
          lastName: "",
          preferredName: "",
          careerStatus: "",
        },
      ] as never,
      firms,
      employments,
      "alpha"
    );
    const teamMatches = teamSearchMatches(
      [
        { id: "team-1", name: "Alpha Team", currentFirmId: FIRM_ID },
        { id: "team-2", name: "Team Alpha", currentFirmId: "missing-firm" },
        { id: "team-3", name: "Alpha Solo" },
      ] as never,
      firms,
      "alpha"
    );

    expect(advisorMatches).toEqual([
      expect.objectContaining({ id: ADVISOR_ID, sub: FIRM_NAME }),
      expect.objectContaining({ id: "advisor-2", sub: "Former advisor" }),
      expect.objectContaining({ id: "advisor-3", sub: null }),
    ]);
    expect(teamMatches).toEqual([
      expect.objectContaining({ id: "team-1", sub: "Alpha Firm" }),
      expect.objectContaining({ id: "team-2", sub: null }),
      expect.objectContaining({ id: "team-3", sub: null }),
    ]);
    expect(
      searchCounts([
        { kind: "firm" } as never,
        ...advisorMatches,
        ...teamMatches,
      ])
    ).toEqual({
      firms: 1,
      advisors: 3,
      teams: 3,
      total: 7,
    });
  });
});
