import { describe, expect, it } from "vitest";

import {
  dateString,
  queueItem,
} from "../src/harper/resource-advisor-research-items.js";
import type { ResourceIndex } from "../src/harper/resource-data.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
} from "../src/types/harper-schema.js";

const PUBLIC_WEB_SOURCE = "public-web";

function resourceIndex(
  rows: Partial<{
    advisors: readonly AdvisorRow[];
    employments: readonly EmploymentHistoryRow[];
    firms: readonly FirmRow[];
  }> = {}
): ResourceIndex {
  const advisors = rows.advisors ?? [];
  const firms = rows.firms ?? [];
  return {
    byAdvisor: new Map(advisors.map(row => [row.id, row])),
    byFirm: new Map(firms.map(row => [row.id, row])),
    employments: rows.employments ?? [],
  } as unknown as ResourceIndex;
}

describe("advisor research queue item helpers", () => {
  it("formats Date instances as ISO strings", () => {
    expect(dateString(new Date("2024-01-02T03:04:05.000Z"))).toBe(
      "2024-01-02T03:04:05.000Z"
    );
  });

  it("builds queue items from enriched advisor and latest employment rows", () => {
    const advisor = {
      finraCrd: "12345",
      firstName: "Ada",
      id: "advisor-1",
      lastName: "Lovelace",
      slug: "ada-lovelace",
    } as unknown as AdvisorRow;
    const db = resourceIndex({
      advisors: [advisor],
      employments: [
        {
          advisorId: "advisor-1",
          firmId: "firm-old",
          id: "employment-old",
          startDate: "2020-01-01",
        } as unknown as EmploymentHistoryRow,
        {
          advisorId: "advisor-1",
          firmId: "firm-new",
          id: "employment-new",
          roleTitle: undefined,
          startDate: "2023-01-01",
        } as unknown as EmploymentHistoryRow,
      ],
      firms: [
        { id: "firm-new", name: "New Firm" } as unknown as FirmRow,
        { id: "firm-old", legalName: "Old Firm" } as unknown as FirmRow,
      ],
    });

    const item = queueItem(
      { id: "advisor-1" } as never,
      {
        checkedAt: "not-a-date",
        id: "check-1",
        nextCheckAfter: "2024-03-01",
        sourceType: "brokercheck",
        status: "stale",
      } as never,
      ["profilePhotoUrl"],
      PUBLIC_WEB_SOURCE,
      db
    );

    expect(item).toMatchObject({
      advisorId: "advisor-1",
      daysSinceLastCheck: null,
      finraCrd: "12345",
      firm: { id: "firm-new", name: "New Firm", roleTitle: null },
      lastCheckedAt: "not-a-date",
      nextCheckAfter: "2024-03-01",
      profileUrl: "/advisor.html?id=ada-lovelace",
      provenance: {
        sourceIds: ["check-1"],
        sourceTable: "AdvisorResearchCheck",
      },
      sourceType: "brokercheck",
      status: "stale",
    });
  });

  it("falls back to the selected advisor when no DB row or check exists", () => {
    const item = queueItem(
      {
        finraCrd: undefined,
        firstName: "Grace",
        id: "advisor-2",
        lastName: "Hopper",
      } as never,
      null,
      [],
      PUBLIC_WEB_SOURCE,
      resourceIndex()
    );

    expect(item).toMatchObject({
      advisorId: "advisor-2",
      daysSinceLastCheck: null,
      firm: null,
      lastCheckedAt: null,
      nextCheckAfter: null,
      profileUrl: "/advisor.html?id=advisor-2",
      provenance: { sourceIds: [] },
      sourceType: PUBLIC_WEB_SOURCE,
      status: null,
    });
  });
});
