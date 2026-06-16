import { describe, expect, it } from "vitest";
import {
  disclosureRow,
  disclosureSummary,
  transitionRow,
  transitionSummary,
} from "../src/harper/resource-feed-events.js";
import type {
  AdvisorRow,
  DisclosureRow,
  FirmRow,
  RecruitingDealQuoteRow,
  SanctionRow,
  TeamRow,
  TransitionEventRow,
} from "../src/types/harper-schema.js";

const fromFirm: FirmRow = {
  id: "firm-from",
  name: "From Firm",
  channel: "wirehouse",
};
const toFirm: FirmRow = {
  id: "firm-to",
  name: "To Firm",
  channel: "ria",
};
const advisor: AdvisorRow = {
  id: "advisor-alpha",
  legalName: "Alex Advisor",
  preferredName: "Alex A.",
};
const team: TeamRow = {
  id: "team-alpha",
  name: "Alpha Team",
};
const deal: RecruitingDealQuoteRow = {
  id: "deal-alpha",
  firmId: "firm-to",
  upfrontPctT12: 120,
  totalPctT12: 260,
  forgivableLoanTermYears: 9,
  producerTier: "elite",
  backendMetrics: "growth",
  clawbackTerms: "standard",
};

const transitionDb = {
  byFirm: new Map([
    [fromFirm.id, fromFirm],
    [toFirm.id, toFirm],
  ]),
  byTeam: new Map([[team.id, team]]),
  byAdvisor: new Map([[advisor.id, advisor]]),
  byDeal: new Map([[deal.id, deal]]),
};

const baseTransition: TransitionEventRow = {
  id: "transition-alpha",
  fromFirmId: fromFirm.id,
  toFirmId: toFirm.id,
  moveDate: "2026-06-01",
};

describe("feed event row builders", () => {
  it("returns null summaries for missing transition and disclosure rows", () => {
    expect(transitionRow(null, transitionDb)).toBeNull();
    expect(transitionSummary(undefined, transitionDb)).toBeNull();
    expect(
      disclosureRow(null, { sanctions: [], byAdvisor: new Map() })
    ).toBeNull();
    expect(
      disclosureSummary(undefined, { sanctions: [], byAdvisor: new Map() })
    ).toBeNull();
  });

  it("expands transition subjects, firm chips, and deal fields", () => {
    expect(
      transitionRow(
        {
          ...baseTransition,
          subjectTeamId: team.id,
          recruitingDealId: deal.id,
        },
        transitionDb
      )
    ).toMatchObject({
      id: baseTransition.id,
      subject: { kind: "team", id: team.id, name: team.name },
      fromFirm: { id: fromFirm.id, name: fromFirm.name, short: fromFirm.name },
      toFirm: { id: toFirm.id, name: toFirm.name, short: toFirm.name },
      deal: {
        upfrontPctT12: deal.upfrontPctT12,
        totalPctT12: deal.totalPctT12,
        producerTier: deal.producerTier,
      },
    });
    expect(
      transitionSummary(
        { ...baseTransition, subjectAdvisorId: advisor.id },
        transitionDb
      )
    ).toMatchObject({
      kind: "transition",
      transitionEventId: baseTransition.id,
      subject: { kind: "advisor", id: advisor.id, name: advisor.preferredName },
      deal: null,
    });
    expect(
      transitionRow(
        { ...baseTransition, subjectFirmId: toFirm.id },
        transitionDb
      )
    ).toMatchObject({
      subject: { kind: "firm", id: toFirm.id, name: toFirm.name },
    });
    expect(transitionRow(baseTransition, transitionDb)).toMatchObject({
      subject: null,
    });
  });

  it("builds disclosure rows with matching sanctions and optional advisor chips", () => {
    const disclosure: DisclosureRow = {
      id: "disclosure-alpha",
      advisorId: advisor.id,
      disclosureType: "customer_dispute",
      regulator: "FINRA",
      status: "settled",
      allegationCategories: ["suitability"],
    };
    const sanction: SanctionRow = {
      id: "sanction-alpha",
      disclosureId: disclosure.id,
      sanctionType: "fine",
      amount: 10000,
    };
    const unrelatedSanction: SanctionRow = {
      id: "sanction-beta",
      disclosureId: "other-disclosure",
      sanctionType: "suspension",
    };

    expect(
      disclosureSummary(disclosure, {
        sanctions: [sanction, unrelatedSanction],
        byAdvisor: new Map([[advisor.id, advisor]]),
      })
    ).toMatchObject({
      kind: "disclosure",
      disclosureId: disclosure.id,
      advisor: { id: advisor.id, name: advisor.preferredName },
      sanctions: [sanction],
    });
    expect(
      disclosureRow(disclosure, {
        sanctions: [],
        byAdvisor: new Map(),
      })
    ).toMatchObject({
      advisor: undefined,
      sanctions: [],
    });
  });
});
