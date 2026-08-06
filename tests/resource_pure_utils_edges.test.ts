import { describe, expect, it } from "vitest";
import { buildBranchCoverageRows } from "../src/harper/resource-branch-coverage-read-model.js";
import {
  branchSourceSummary,
  publicBranchSourceLabel,
} from "../src/harper/resource-branch-source-labels.js";
import {
  boundedNumber,
  isNonEmptyString,
  normalizeState,
  normalizeYear,
  readQuery,
  toIsoOrNull,
  toWatchlistTarget,
} from "../src/harper/resource-recruiting-market-utils.js";
import type { EmploymentHistoryRow } from "../src/types/harper-schema.js";

describe("resource pure utility edge cases", () => {
  it("ignores employment rows without usable branch ids in branch coverage", () => {
    const rows = buildBranchCoverageRows(
      {
        branches: [
          {
            id: "branch-1",
            firmId: "firm-1",
            level: "office",
          },
        ],
        firms: [{ id: "firm-1" }],
        employments: [
          {
            id: "employment-valid",
            advisorId: "advisor-1",
            firmId: "firm-1",
            branchId: "branch-1",
            sourceType: "brokercheck",
          },
          {
            id: "employment-ended",
            advisorId: "advisor-ended",
            firmId: "firm-1",
            branchId: "branch-1",
            endDate: "2024-01-01",
            sourceType: "major-firm-roster",
          },
          {
            id: "employment-empty-branch",
            advisorId: "advisor-empty",
            firmId: "firm-1",
            branchId: "",
            sourceType: "ignored",
          },
          {
            id: "employment-missing-branch",
            advisorId: "advisor-missing",
            firmId: "firm-1",
            sourceType: "ignored",
          },
          {
            id: "employment-numeric-branch",
            advisorId: "advisor-numeric",
            firmId: "firm-1",
            branchId: 42,
            sourceType: "ignored",
          } as unknown as EmploymentHistoryRow,
        ],
      },
      "2026-08-06T00:00:00.000Z"
    );

    expect(rows).toEqual([
      expect.objectContaining({
        branchId: "branch-1",
        coverageStatus: "loaded",
        currentAdvisorCount: 1,
        sourceTypes: ["brokercheck", "major-firm-roster"],
        sourceLabels: [
          "FINRA BrokerCheck registration data",
          "Major Firm Roster public source",
        ],
      }),
    ]);
  });

  it("summarizes branch sources with public labels and readable fallbacks", () => {
    const sourceRows = [
      { sourceType: "brokercheck" },
      { sourceType: "brokercheck" },
      { sourceType: "" },
      { sourceType: null },
      { sourceType: "internal-custom_source" },
    ] satisfies ReadonlyArray<Partial<EmploymentHistoryRow>>;

    expect(
      branchSourceSummary(sourceRows as ReadonlyArray<EmploymentHistoryRow>)
    ).toEqual({
      sourceTypes: ["brokercheck", "internal-custom_source"],
      sourceLabels: [
        "FINRA BrokerCheck registration data",
        "Internal Custom Source public source",
      ],
      sourceRefs: [],
    });
    expect(publicBranchSourceLabel("")).toBe("Unknown public source");
  });

  it("coerces recruiting-market query values through bounded fallbacks", () => {
    expect(boundedNumber(null, 10, 1, 20)).toBe(10);
    expect(boundedNumber("", 10, 1, 20)).toBe(10);
    expect(boundedNumber("not-a-number", 10, 1, 20)).toBe(10);
    expect(boundedNumber("0", 10, 1, 20)).toBe(1);
    expect(boundedNumber("25.9", 10, 1, 20)).toBe(20);
    expect(boundedNumber("7.9", 10, 1, 20)).toBe(7);

    expect(normalizeState(" tx ")).toBe("TX");
    expect(normalizeState("")).toBeNull();
    expect(normalizeYear(2026)).toBe("2026");
    expect(normalizeYear("26")).toBeNull();
  });

  it("adapts Harper route targets without exposing non-iterable accessors", () => {
    expect(toWatchlistTarget(undefined)).toEqual({});
    expect(toWatchlistTarget("route-id")).toEqual({});
    expect(readQuery(undefined, "state")).toBeUndefined();

    const target = {
      get(name: string) {
        return name === "state" ? "ny" : undefined;
      },
      getAll(name: string) {
        return name === "firm" ? "not-an-array" : ["alpha", "beta"];
      },
    };
    const watchTarget = toWatchlistTarget(target);

    expect(readQuery(target, "state")).toBe("ny");
    expect([...(watchTarget.getAll?.("firm") ?? [])]).toEqual([
      "n",
      "o",
      "t",
      "-",
      "a",
      "n",
      "-",
      "a",
      "r",
      "r",
      "a",
      "y",
    ]);
    expect([...(watchTarget.getAll?.("other") ?? [])]).toEqual([
      "alpha",
      "beta",
    ]);
    expect(toWatchlistTarget({ get: "state", getAll: 42 }).get).toBeUndefined();
    expect([
      ...(toWatchlistTarget({ getAll: () => 42 }).getAll?.("firm") ?? []),
    ]).toEqual([]);
  });

  it("normalizes nullable dates and filters non-empty strings", () => {
    const date = new Date("2026-06-24T08:00:00.000Z");

    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull("")).toBeNull();
    expect(toIsoOrNull(date)).toBe("2026-06-24T08:00:00.000Z");
    expect(toIsoOrNull("2026-06-24")).toBe("2026-06-24");
    expect(["alpha", "", null, "beta"].filter(isNonEmptyString)).toEqual([
      "alpha",
      "beta",
    ]);
  });
});
