import { describe, expect, it } from "vitest";

import {
  readStatusParam,
  teamProfilePayload,
} from "../src/harper/resource-profile-endpoints-helpers.js";

describe("profile endpoint helper edges", () => {
  it("reads status params only from route targets with string values", () => {
    expect(readStatusParam(undefined)).toBeNull();
    expect(readStatusParam("team-1")).toBeNull();
    expect(readStatusParam({ id: "team-1" })).toBeNull();
    expect(
      readStatusParam({
        get: (name: string) => (name === "status" ? 42 : null),
      })
    ).toBeNull();
    expect(
      readStatusParam({
        get: (name: string) => (name === "status" ? "pending" : null),
      })
    ).toBe("pending");
  });

  it("returns null current firm and branch details for unassigned teams", () => {
    const response = teamProfilePayload(
      {
        byFirm: new Map(),
        byBranch: new Map(),
        byAdvisor: new Map(),
        memberships: [],
        teamMembers: [],
        teamSnaps: [],
        transitions: [],
        mTeam: [],
        articles: [],
        byArticle: new Map(),
      } as never,
      {
        id: "team-1",
        name: "Solo Practice",
        currentFirmId: null,
        currentBranchId: null,
      } as never
    );

    expect(response.currentFirm).toBeNull();
    expect(response.currentBranch).toBeNull();
    expect(response.currentMembers).toEqual([]);
    expect(response.pastMembers).toEqual([]);
  });
});
