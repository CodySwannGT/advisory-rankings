import { describe, expect, it } from "vitest";

import {
  advisorSearchMatches,
  firmSearchMatches,
  searchCounts,
  teamSearchMatches,
} from "../src/harper/resource-search.js";
import { runGlobalSearch } from "../src/harper/resource-directory-search-runner.js";

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

  it("serializes all-kind indexed reads so firm matches survive Harper concurrency", async () => {
    const previousTables = (globalThis as any).tables;
    const activeReads = { count: 0 };
    (globalThis as any).tables = {
      AdvisorSearchIndex: serialSearchTable(activeReads, [
        { advisorId: ADVISOR_ID, token: "alpha" },
      ]),
      Advisor: serialSearchTable(activeReads, [
        {
          careerStatus: "Active",
          firstName: "Alpha",
          id: ADVISOR_ID,
          lastName: "Advisor",
          legalName: "Alpha Advisor",
          preferredName: "",
        },
      ]),
      EmploymentHistory: serialSearchTable(activeReads, []),
      Firm: serialSearchTable(activeReads, [
        {
          channel: "wirehouse",
          hqCity: "New York",
          hqState: "NY",
          id: FIRM_ID,
          legalName: "",
          name: FIRM_NAME,
        },
      ]),
      FirmAlias: serialSearchTable(activeReads, []),
      Team: serialSearchTable(activeReads, []),
    };

    try {
      const response = await runGlobalSearch({
        cap: 5,
        kind: "all",
        norm: "alpha",
      });

      expect(response.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: ADVISOR_ID, kind: "advisor" }),
          expect.objectContaining({ id: FIRM_ID, kind: "firm" }),
        ])
      );
      expect(response.counts).toMatchObject({ advisors: 1, firms: 1 });
    } finally {
      (globalThis as any).tables = previousTables;
    }
  });
});

/**
 * Builds a Harper-like table that exposes accidental cross-table read fan-out.
 * @param activeReads - Shared active read counter.
 * @param activeReads.count - Number of table reads currently in progress.
 * @param rows - Rows returned by this table.
 * @returns Minimal table search surface.
 */
function serialSearchTable<T extends Record<string, unknown>>(
  activeReads: { count: number },
  rows: readonly T[]
) {
  return {
    async *search(query: {
      readonly conditions?: readonly {
        readonly attribute: string;
        readonly comparator?: string;
        readonly value: unknown;
      }[];
      readonly limit?: number;
    }) {
      activeReads.count += 1;
      expect(activeReads.count).toBe(1);
      await Promise.resolve();
      try {
        yield* rows
          .filter(rowMatches(query.conditions ?? []))
          .slice(0, query.limit ?? rows.length);
      } finally {
        activeReads.count -= 1;
      }
    },
  };
}

const rowMatches =
  (
    conditions: readonly {
      readonly attribute: string;
      readonly comparator?: string;
      readonly value: unknown;
    }[]
  ) =>
  (row: Record<string, unknown>): boolean =>
    conditions.every(condition => {
      const candidate = row[condition.attribute];
      if (condition.comparator === "starts_with") {
        return (
          typeof candidate === "string" &&
          candidate.startsWith(String(condition.value))
        );
      }
      return candidate === condition.value;
    });
