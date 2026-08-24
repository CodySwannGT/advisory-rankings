import { describe, expect, it } from "vitest";

import {
  type AdvisorResearchAdvisor,
  type AdvisorResearchCheck,
  selectDueAdvisors,
} from "../src/lib/advisor-research-select.js";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const SOURCE_TYPE = "public_web_research";

const advisor = (
  overrides: Partial<AdvisorResearchAdvisor>
): AdvisorResearchAdvisor => ({
  id: "advisor-1",
  legalName: "Advisor One",
  ...overrides,
});

const check = (
  overrides: Partial<AdvisorResearchCheck>
): AdvisorResearchCheck => ({
  id: "check-1",
  advisorId: "advisor-1",
  sourceType: SOURCE_TYPE,
  checkedAt: "2026-07-01T00:00:00.000Z",
  status: "complete",
  ...overrides,
});

describe("selectDueAdvisors", () => {
  it("skips advisors with a future next check date", () => {
    const due = selectDueAdvisors(
      [advisor({})],
      [check({ nextCheckAfter: "2026-09-01T00:00:00.000Z" })],
      { max: 5, staleDays: 7, sourceType: SOURCE_TYPE, now: NOW }
    );
    expect(due).toEqual([]);
  });

  it("treats invalid check dates as due and reports missing array fields", () => {
    const due = selectDueAdvisors(
      [
        advisor({
          id: "advisor-2",
          legalName: undefined,
          headshotUrl: [] as unknown as string,
          bioText: "Published bio",
        }),
      ],
      [check({ advisorId: "advisor-2", checkedAt: "not-a-date" })],
      { max: 5, staleDays: 30, sourceType: SOURCE_TYPE, now: NOW }
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.daysSinceLastCheck).toBeNull();
    expect(due[0]?.missingFields).toEqual([
      "headshotUrl",
      "linkedinUrl",
      "businessEmail",
      "businessPhone",
    ]);
  });

  it("orders stale advisors by latest matching check and name fallback", () => {
    const due = selectDueAdvisors(
      [
        advisor({ id: "advisor-2", legalName: undefined }),
        advisor({ id: "advisor-1", legalName: "Alpha Advisor" }),
        advisor({ id: "advisor-3", legalName: "Zeta Advisor" }),
      ],
      [
        check({
          id: "old",
          advisorId: "advisor-3",
          checkedAt: "2026-07-01T00:00:00.000Z",
        }),
        check({
          id: "newer",
          advisorId: "advisor-3",
          checkedAt: "2026-07-15T00:00:00.000Z",
        }),
        check({
          id: "ignored-source",
          advisorId: "advisor-1",
          sourceType: "brokercheck",
          checkedAt: "2026-08-20T00:00:00.000Z",
        }),
      ],
      { max: 3, staleDays: 30, sourceType: SOURCE_TYPE, now: NOW }
    );
    expect(due.map(item => item.advisor.id)).toEqual([
      "advisor-2",
      "advisor-1",
      "advisor-3",
    ]);
    expect(due[0]?.lastCheck).toBeNull();
    expect(due[1]?.lastCheck).toBeNull();
    expect(due[2]?.lastCheck?.id).toBe("newer");
  });
});
