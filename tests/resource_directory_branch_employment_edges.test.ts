import { describe, expect, it } from "vitest";

import { groupEmploymentsByBranch } from "../src/harper/resource-directory-branch-employment.js";
import type { EmploymentHistoryRow } from "../src/types/harper-schema.js";

describe("branch employment grouping edges", () => {
  it("skips unbranched rows and preserves unrelated branch groups", () => {
    const first: EmploymentHistoryRow = {
      id: "employment-first",
      advisorId: "advisor-first",
      firmId: "firm-a",
      branchId: "branch-a",
    };
    const skipped: EmploymentHistoryRow = {
      id: "employment-unbranched",
      advisorId: "advisor-skipped",
      firmId: "firm-a",
    };
    const secondBranch: EmploymentHistoryRow = {
      id: "employment-second-branch",
      advisorId: "advisor-second-branch",
      firmId: "firm-a",
      branchId: "branch-b",
    };
    const secondForFirstBranch: EmploymentHistoryRow = {
      id: "employment-second-first-branch",
      advisorId: "advisor-second-first-branch",
      firmId: "firm-a",
      branchId: "branch-a",
    };

    const grouped = groupEmploymentsByBranch([
      first,
      skipped,
      secondBranch,
      secondForFirstBranch,
    ]);

    expect(grouped.get("branch-a")).toEqual([first, secondForFirstBranch]);
    expect(grouped.get("branch-b")).toEqual([secondBranch]);
    expect(grouped.has("")).toBe(false);
  });
});
