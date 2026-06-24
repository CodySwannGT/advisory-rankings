import { describe, expect, it } from "vitest";
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
