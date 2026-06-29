import { describe, expect, it } from "vitest";

import {
  advisorDirectoryKey,
  branchDirectoryKey,
  compareAdvisorDirectoryRows,
  compareBranchDirectoryRows,
  compareFirmDirectoryRows,
  compareTeamDirectoryRows,
  teamDirectoryKey,
} from "../src/harper/resource-directory-sorting.js";

describe("directory sorting edges", () => {
  it("falls back to stable empty keys for sparse directory rows", () => {
    expect(advisorDirectoryKey({ id: "advisor-1" } as never)).toBe("");
    expect(
      advisorDirectoryKey({ id: "advisor-2", legalName: "Jane Doe" } as never)
    ).toBe("jane doe");
    expect(teamDirectoryKey({ id: "team-1" } as never)).toBe("");
    expect(
      branchDirectoryKey({
        id: "branch-1",
        firmName: "",
        state: "NY",
        city: undefined,
        displayName: "Midtown",
      } as never)
    ).toBe("\u0000ny\u0000\u0000midtown");
  });

  it("orders directory rows by keys before deterministic id tie-breaks", () => {
    expect(
      compareFirmDirectoryRows(
        { id: "firm-b", name: "Beta" } as never,
        { id: "firm-a", name: "Alpha" } as never
      )
    ).toBe(1);
    expect(
      compareAdvisorDirectoryRows(
        { id: "advisor-b", lastName: "Smith" } as never,
        { id: "advisor-a", lastName: "Smith" } as never
      )
    ).toBeGreaterThan(0);
    expect(
      compareTeamDirectoryRows(
        { id: "team-a", name: "Alpha" } as never,
        { id: "team-b", name: "Beta" } as never
      )
    ).toBe(-1);
    expect(
      compareBranchDirectoryRows(
        {
          id: "branch-b",
          firmName: "Wirehouse",
          state: "TX",
          city: "Austin",
          displayName: "Downtown",
        } as never,
        {
          id: "branch-a",
          firmName: "Wirehouse",
          state: "TX",
          city: "Austin",
          displayName: "Downtown",
        } as never
      )
    ).toBeGreaterThan(0);
  });
});
