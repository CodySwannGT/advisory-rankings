import { describe, expect, it } from "vitest";
import {
  advisorChip,
  firmChip,
  teamChip,
} from "../src/harper/resource-feed-chips.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  TeamMetricSnapshotRow,
  TeamRow,
} from "../src/types/harper-schema.js";

const firm: FirmRow = {
  id: "firm-alpha",
  name: "Alpha Wealth",
  channel: "ria",
  hqCity: "Austin",
  hqState: "TX",
};

describe("feed chips", () => {
  it("builds advisor chips with current firm context and nullable fallbacks", () => {
    const advisor: AdvisorRow = {
      id: "advisor-alpha",
      legalName: "Alex Advisor",
      headshotUrl: "",
      careerStatus: "",
    };
    const activeEmployment: EmploymentHistoryRow = {
      id: "employment-active",
      advisorId: advisor.id,
      firmId: firm.id,
      roleTitle: "Managing Partner",
      startDate: "2026-01-01",
    };
    const earlierEmployment: EmploymentHistoryRow = {
      id: "employment-earlier",
      advisorId: advisor.id,
      firmId: "firm-old",
      startDate: "2025-01-01",
    };

    expect(
      advisorChip(advisor, {
        employments: [earlierEmployment, activeEmployment],
        byFirm: new Map([[firm.id, firm]]),
      })
    ).toMatchObject({
      id: advisor.id,
      kind: "advisor",
      name: advisor.legalName,
      headshotUrl: null,
      role: activeEmployment.roleTitle,
      firm: { id: firm.id, name: firm.name, short: firm.name },
      careerStatus: null,
    });
    expect(
      advisorChip(advisor, {
        employments: [],
        byFirm: new Map(),
      })
    ).toMatchObject({
      firm: null,
      role: null,
    });
  });

  it("builds firm chips with headquarters and nullable visual fields", () => {
    expect(firmChip(firm)).toMatchObject({
      id: firm.id,
      kind: "firm",
      name: firm.name,
      short: firm.name,
      logoUrl: null,
      hq: "Austin, TX",
      dissolvedYear: null,
    });
    expect(
      firmChip({ ...firm, hqCity: undefined, hqState: undefined })
    ).toMatchObject({
      hq: null,
    });
  });

  it("builds team chips from current firm and latest metric snapshot", () => {
    const team: TeamRow = {
      id: "team-alpha",
      name: "Alpha Team",
      currentFirmId: firm.id,
      serviceModel: "",
    };
    const oldSnapshot: TeamMetricSnapshotRow = {
      id: "snapshot-old",
      teamId: team.id,
      asOf: "2025-01-01",
      aum: 10,
      teamSize: 2,
    };
    const latestSnapshot: TeamMetricSnapshotRow = {
      id: "snapshot-latest",
      teamId: team.id,
      asOf: "2026-01-01",
      aum: 20,
      teamSize: 4,
    };

    expect(
      teamChip(team, {
        teamSnaps: [oldSnapshot, latestSnapshot],
        byFirm: new Map([[firm.id, firm]]),
      })
    ).toMatchObject({
      id: team.id,
      kind: "team",
      name: team.name,
      firm: { id: firm.id, name: firm.name, short: firm.name },
      serviceModel: null,
      aum: latestSnapshot.aum,
      teamSize: latestSnapshot.teamSize,
    });
    expect(
      teamChip(
        { id: "team-beta", name: "Beta Team" },
        { teamSnaps: [], byFirm: new Map() }
      )
    ).toMatchObject({
      firm: null,
      aum: null,
      teamSize: null,
    });
  });
});
