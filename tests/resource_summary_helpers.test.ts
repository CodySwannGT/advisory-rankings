import { describe, expect, it } from "vitest";

import {
  countMap,
  earliestDate,
  latestDate,
} from "../src/harper/resource-summary-helpers.js";

const FEBRUARY_DATE = "2024-02-01";

describe("resource summary helpers", () => {
  it("keeps every requested count key and normalizes missing values", () => {
    expect(
      countMap(["active", "inactive"], ["ACTIVE", null, "inactive"])
    ).toEqual({
      active: 1,
      inactive: 1,
    });
    expect(countMap(["active", "inactive"])).toEqual({
      active: 0,
      inactive: 0,
    });
  });

  it("returns the latest date-like value while ignoring empty candidates", () => {
    expect(latestDate([null, "2024-01-01", undefined, FEBRUARY_DATE])).toBe(
      FEBRUARY_DATE
    );
    expect(latestDate([undefined, null])).toBeNull();
  });

  it("returns the earliest date-like value while ignoring empty candidates", () => {
    expect(earliestDate([null, "2024-03-01", undefined, FEBRUARY_DATE])).toBe(
      FEBRUARY_DATE
    );
    expect(earliestDate([undefined, null])).toBeNull();
  });
});
