import { describe, expect, it } from "vitest";

import {
  directoryLabelSpecs,
  labelsMatchDirectoryControls,
  parseDirectoryStatValue,
  rawDirectoryMetricsAreHidden,
  type DirectoryLabelObservation,
} from "./web_smoke_directory_filter_support.js";

describe("directory filter smoke support", () => {
  it("requires every firm filter label to target the expected control", () => {
    const observations = observationsFor("firms");

    expect(labelsMatchDirectoryControls("firms", observations)).toBe(true);
    expect(
      labelsMatchDirectoryControls(
        "firms",
        observations.map(item =>
          item.id === "firm-filter-channel"
            ? { ...item, controlName: "state" }
            : item
        )
      )
    ).toBe(false);
    expect(
      labelsMatchDirectoryControls(
        "firms",
        observations.filter(item => item.id !== "firm-filter-active")
      )
    ).toBe(false);
  });

  it("requires the team service-model filter to remain a select", () => {
    const observations = observationsFor("teams");

    expect(labelsMatchDirectoryControls("teams", observations)).toBe(true);
    expect(
      labelsMatchDirectoryControls(
        "teams",
        observations.map(item =>
          item.id === "team-filter-serviceModel"
            ? { ...item, controlTag: "INPUT" }
            : item
        )
      )
    ).toBe(false);
  });

  it("parses formatted directory stats and rejects missing numeric copy", () => {
    expect(parseDirectoryStatValue("1,234 firms")).toBe(1234);
    expect(parseDirectoryStatValue("Showing: 25")).toBe(25);
    expect(parseDirectoryStatValue("Matches unavailable")).toBeNaN();
  });

  it("detects raw implementation metrics in the directory rail", () => {
    expect(
      rawDirectoryMetricsAreHidden("Firm directory Showing 20 Matches 1,234")
    ).toBe(true);
    expect(rawDirectoryMetricsAreHidden("Loaded 20 Total 1,234")).toBe(false);
    expect(rawDirectoryMetricsAreHidden("Page size 20")).toBe(false);
  });
});

function observationsFor(
  pageName: Parameters<typeof directoryLabelSpecs>[0]
): readonly DirectoryLabelObservation[] {
  return directoryLabelSpecs(pageName).map(spec => ({
    controlName: spec.name,
    controlTag: spec.controlTag,
    id: spec.id,
    labelText: spec.labelText,
  }));
}
