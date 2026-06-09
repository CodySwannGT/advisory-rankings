import { describe, expect, it } from "vitest";
import {
  asRows,
  datePrefix,
  firmNameMatch,
  initialStats,
  matchAdvisorFirstLast,
  matchAdvisorLegalName,
  rowString,
} from "../src/lib/brokercheck-resolver-helpers.js";

describe("brokercheck resolver helpers", () => {
  it("filters REST payloads down to Harper row objects", () => {
    const row = { id: "advisor-1" };

    expect(
      asRows([row, null, ["nested"], "name", { id: "advisor-2" }])
    ).toEqual([row, { id: "advisor-2" }]);
    expect(asRows({ id: "not-array" })).toEqual([]);
  });

  it("starts resolver stats at zero for every tracked counter", () => {
    expect(Object.values(initialStats())).toEqual(
      Array.from({ length: 14 }, () => 0)
    );
  });

  it("normalizes nullable row values and BrokerCheck date prefixes", () => {
    expect(rowString(null)).toBe("");
    expect(rowString(12345)).toBe("12345");

    expect(datePrefix(undefined)).toBe("");
    expect(datePrefix("2026-06-09T12:34:56Z")).toBe("2026-06-09");
    expect(datePrefix("pending")).toBe("pending");
  });

  it("matches firm names after punctuation, whitespace, and suffix normalization", () => {
    expect(firmNameMatch("Example Wealth, LLC", "example wealth")).toBe(true);
    expect(
      firmNameMatch("Example Wealth Corporation", "Example Wealth Corp")
    ).toBe(true);
    expect(firmNameMatch("", "Example Wealth")).toBe(false);
    expect(firmNameMatch("Example Wealth", "Other Wealth")).toBe(false);
  });

  it("matches advisors by exact legal name", () => {
    const advisors = [
      { id: "advisor-1", legalName: "Jane Example" },
      { id: "advisor-2", legalName: "John Example" },
    ];

    expect(matchAdvisorLegalName(advisors, "jane example")).toBe("advisor-1");
    expect(matchAdvisorLegalName(advisors, "")).toBeNull();
    expect(matchAdvisorLegalName(advisors, "Missing Person")).toBeNull();
  });

  it("matches first and last names while rejecting ambiguous fallback matches", () => {
    const advisors = [
      { id: "advisor-1", firstName: "Jane", lastName: "Example" },
      { id: "advisor-2", firstName: "Janet", lastName: "Example" },
      { id: "advisor-3", firstName: "Ada", lastName: "Lovelace" },
    ];

    expect(
      matchAdvisorFirstLast(advisors, {
        firstName: "Jane",
        lastName: "Example",
      })
    ).toBe("advisor-1");
    expect(
      matchAdvisorFirstLast(advisors, { firstName: "A.", lastName: "Lovelace" })
    ).toBe("advisor-3");
    expect(
      matchAdvisorFirstLast(advisors, {
        firstName: "Missing",
        lastName: "Example",
      })
    ).toBeNull();
    expect(matchAdvisorFirstLast(advisors, { lastName: "Example" })).toBeNull();
  });
});
