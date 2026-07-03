import { describe, expect, it, vi } from "vitest";
import {
  buildResearchCheck,
  selectDueAdvisors,
} from "../src/lib/advisor-research.js";

const now = new Date("2026-05-21T12:00:00Z");
const today = "2026-05-21";

describe("advisor research queue", () => {
  it("selects never-checked and stale advisors first", () => {
    const advisors = [
      { id: "a1", legalName: "Never Checked", headshotUrl: "" },
      { id: "a2", legalName: "Fresh Checked" },
      {
        id: "a3",
        legalName: "Stale Checked",
        linkedinUrl: "https://example.com/in/a3",
      },
    ];
    const checks = [
      {
        id: "c2",
        advisorId: "a2",
        sourceType: "web_research",
        checkedAt: "2026-05-10",
        status: "no_new_data",
      },
      {
        id: "c3",
        advisorId: "a3",
        sourceType: "web_research",
        checkedAt: "2026-04-01",
        status: "success",
      },
    ];

    const due = selectDueAdvisors(advisors, checks, {
      max: 5,
      staleDays: 30,
      sourceType: "web_research",
      now,
    });

    expect(due.map(item => item.advisor.id)).toEqual(["a1", "a3"]);
    expect(due[0].lastCheck).toBeNull();
    expect(due[0].missingFields).toContain("headshotUrl");
    expect(due[1].daysSinceLastCheck).toBe(50);
  });

  it("respects nextCheckAfter", () => {
    const due = selectDueAdvisors(
      [{ id: "a1", legalName: "Deferred" }],
      [
        {
          id: "c1",
          advisorId: "a1",
          sourceType: "web_research",
          checkedAt: "2026-01-01",
          status: "failed",
          nextCheckAfter: "2026-06-01",
        },
      ],
      { max: 5, staleDays: 30, sourceType: "web_research", now }
    );

    expect(due).toHaveLength(0);
  });

  it("builds deterministic daily check rows", () => {
    const row = buildResearchCheck({
      advisorId: "advisor-1",
      sourceType: "web_research",
      status: "no_new_data",
      checkedAt: today,
      sourcesChecked: ["https://example.com/bio"],
      notes: "No new fields found",
    });

    expect(row).toMatchObject({
      advisorId: "advisor-1",
      sourceType: "web_research",
      checkedAt: today,
      status: "no_new_data",
      sourcesChecked: ["https://example.com/bio"],
    });
    expect(row.id).toBe(
      buildResearchCheck({
        advisorId: "advisor-1",
        sourceType: "web_research",
        status: "success",
        checkedAt: today,
      }).id
    );
  });

  it("defaults research check dates to the current day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T23:30:00Z"));

    try {
      const row = buildResearchCheck({
        advisorId: "advisor-2",
        sourceType: "web_research",
        status: "success",
      });

      expect(row.checkedAt).toBe("2026-05-22");
      expect(row.id).toBe(
        buildResearchCheck({
          advisorId: "advisor-2",
          sourceType: "web_research",
          status: "failed",
          checkedAt: "2026-05-22",
        }).id
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
