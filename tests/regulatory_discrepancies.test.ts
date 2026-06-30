import { describe, expect, it } from "vitest";

import { detectMaterialDisclosureDiscrepancies } from "../src/lib/regulatory-discrepancies.js";
import type {
  DisclosureRow,
  FieldAssertionRow,
  SanctionRow,
} from "../src/types/harper-schema.js";

const ADVISOR_ID = "advisor-cairnes";
const ARTICLE_ID = "article-cairnes";
const AWC_DOCKET = "2023079356701";

const advisorHubDisclosure: DisclosureRow = {
  id: "advisorhub-disclosure-cairnes-awc",
  advisorId: ADVISOR_ID,
  disclosureType: "regulatory",
  regulator: "FINRA",
  docketNumber: AWC_DOCKET,
  dateInitiated: "2025-10-01",
  sourceType: "advisorhub_article",
  sourceRef: ARTICLE_ID,
};

const brokerCheckDisclosure: DisclosureRow = {
  id: "brokercheck-disclosure-cairnes-awc",
  advisorId: ADVISOR_ID,
  disclosureType: "regulatory",
  regulator: "FINRA",
  docketNumber: AWC_DOCKET,
  dateInitiated: "2025-10-01",
  sourceType: "brokercheck",
  sourceRef: "brokercheck-snapshot-cairnes",
};

const advisorHubFine: SanctionRow = {
  id: "advisorhub-fine-cairnes",
  disclosureId: advisorHubDisclosure.id,
  sanctionType: "fine",
  amount: 25000,
};

const brokerCheckFine = (amount: number): SanctionRow => ({
  id: `brokercheck-fine-${amount}`,
  disclosureId: brokerCheckDisclosure.id,
  sanctionType: "fine",
  amount,
});

const advisorHubFineAssertion: FieldAssertionRow = {
  id: "assertion-cairnes-fine",
  articleId: ARTICLE_ID,
  targetTable: "Sanction",
  targetId: advisorHubFine.id,
  fieldName: "amount",
  assertedValue: "$25,000",
  quotePhrase: "suspended for four months and fined $25,000",
  confidence: "asserted",
};

describe("regulatory discrepancy detector", () => {
  it("creates one high-severity Cairnes fine discrepancy while retaining both values", () => {
    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubDisclosure, brokerCheckDisclosure],
      sanctions: [advisorHubFine, brokerCheckFine(2500)],
      fieldAssertions: [advisorHubFineAssertion],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      advisorId: ADVISOR_ID,
      fieldName: "fineAmount",
      advisorHubSourceType: "advisorhub_article",
      advisorHubSourceRef: ARTICLE_ID,
      advisorHubValue: "25000",
      brokerCheckSourceType: "brokercheck",
      brokerCheckSourceRef: "brokercheck-snapshot-cairnes",
      brokerCheckValue: "2500",
      severity: "high",
      status: "open",
    });
    expect(JSON.parse(rows[0].sourceMetadata ?? "{}")).toMatchObject({
      regulator: "FINRA",
      docketNumber: AWC_DOCKET,
      advisorHubDisclosureId: advisorHubDisclosure.id,
      brokerCheckDisclosureId: brokerCheckDisclosure.id,
    });
  });

  it("suppresses matching source values for the same advisor event", () => {
    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubDisclosure, brokerCheckDisclosure],
      sanctions: [advisorHubFine, brokerCheckFine(25000)],
      fieldAssertions: [advisorHubFineAssertion],
    });

    expect(rows).toEqual([]);
  });

  it("matches suspension discrepancies by regulator and nearby date when docket is absent", () => {
    const advisorHubNoDocket = {
      ...advisorHubDisclosure,
      id: "advisorhub-suspension-no-docket",
      docketNumber: undefined,
      dateInitiated: new Date("2025-10-01T12:00:00Z"),
    };
    const brokerCheckNoDocket = {
      ...brokerCheckDisclosure,
      id: "brokercheck-suspension-no-docket",
      docketNumber: undefined,
      sourceRef: undefined,
      dateInitiated: "2025-10-20",
    };
    const advisorHubSuspension = {
      id: "advisorhub-suspension-cairnes",
      disclosureId: advisorHubNoDocket.id,
      sanctionType: "suspension",
      durationMonths: 4,
    };
    const brokerCheckSuspension = {
      id: "brokercheck-suspension-cairnes",
      disclosureId: brokerCheckNoDocket.id,
      sanctionType: "suspension",
      durationMonths: 2,
    };

    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubNoDocket, brokerCheckNoDocket],
      sanctions: [advisorHubSuspension, brokerCheckSuspension],
      fieldAssertions: [
        {
          ...advisorHubFineAssertion,
          id: "assertion-cairnes-suspension",
          targetId: advisorHubSuspension.id,
          fieldName: "durationMonths",
          assertedValue: "4",
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fieldName: "suspensionMonths",
      brokerCheckSourceRef: `crd:${ADVISOR_ID}:docket:`,
      advisorHubValue: "4",
      brokerCheckValue: "2",
    });
  });

  it("requires shared event evidence before comparing different source values", () => {
    const unrelatedBrokerCheckDisclosure = {
      ...brokerCheckDisclosure,
      id: "brokercheck-unrelated",
      docketNumber: "unrelated-docket",
      dateInitiated: "2024-01-01",
    };

    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubDisclosure, unrelatedBrokerCheckDisclosure],
      sanctions: [
        advisorHubFine,
        {
          ...brokerCheckFine(2500),
          disclosureId: unrelatedBrokerCheckDisclosure.id,
        },
      ],
      fieldAssertions: [advisorHubFineAssertion],
    });

    expect(rows).toEqual([]);
  });

  it("matches bar discrepancies by shared cluster and normalizes JSON scalar values", () => {
    const advisorHubBarDisclosure = {
      ...advisorHubDisclosure,
      id: "advisorhub-bar-cluster",
      clusterId: "cluster-bar-1",
      docketNumber: undefined,
      regulator: undefined,
    };
    const brokerCheckBarDisclosure = {
      ...brokerCheckDisclosure,
      id: "brokercheck-bar-cluster",
      clusterId: "cluster-bar-1",
      docketNumber: "BAR-2026-1",
      sourceRef: undefined,
    };
    const advisorHubBar = {
      id: "advisorhub-bar",
      disclosureId: advisorHubBarDisclosure.id,
      sanctionType: "bar",
      durationMonths: 12,
    };
    const brokerCheckBar = {
      id: "brokercheck-bar",
      disclosureId: brokerCheckBarDisclosure.id,
      sanctionType: "bar",
      durationMonths: 6,
    };

    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubBarDisclosure, brokerCheckBarDisclosure],
      sanctions: [advisorHubBar, brokerCheckBar],
      fieldAssertions: [
        {
          ...advisorHubFineAssertion,
          id: "assertion-bar-duration",
          targetId: advisorHubBar.id,
          fieldName: "durationMonths",
          assertedValue: '"12"',
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fieldName: "barMonths",
      advisorHubValue: "12",
      brokerCheckSourceRef: `crd:${ADVISOR_ID}:docket:BAR-2026-1`,
      brokerCheckValue: "6",
    });
    expect(JSON.parse(rows[0].sourceMetadata ?? "{}")).toMatchObject({
      regulator: "FINRA",
      docketNumber: "BAR-2026-1",
    });
  });

  it("does not compare regulator matches with invalid or distant dates", () => {
    const invalidAdvisorHubDisclosure = {
      ...advisorHubDisclosure,
      id: "advisorhub-invalid-date",
      docketNumber: undefined,
      dateInitiated: "not-a-date",
    };
    const distantBrokerCheckDisclosure = {
      ...brokerCheckDisclosure,
      id: "brokercheck-distant-date",
      docketNumber: undefined,
      dateInitiated: "2026-06-01",
    };

    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [invalidAdvisorHubDisclosure, distantBrokerCheckDisclosure],
      sanctions: [
        {
          ...advisorHubFine,
          disclosureId: invalidAdvisorHubDisclosure.id,
        },
        {
          ...brokerCheckFine(2500),
          disclosureId: distantBrokerCheckDisclosure.id,
        },
      ],
      fieldAssertions: [advisorHubFineAssertion],
    });

    expect(rows).toEqual([]);
  });

  it("ignores incomplete, BrokerCheck-sourced, and unsupported assertions", () => {
    const brokerCheckSourcedFine = {
      ...advisorHubFine,
      id: "brokercheck-source-assertion-fine",
      disclosureId: brokerCheckDisclosure.id,
    };

    const rows = detectMaterialDisclosureDiscrepancies({
      disclosures: [advisorHubDisclosure, brokerCheckDisclosure],
      sanctions: [
        brokerCheckSourcedFine,
        {
          id: "unsupported-censure",
          disclosureId: advisorHubDisclosure.id,
          sanctionType: "censure",
        },
        {
          id: "missing-disclosure",
          disclosureId: "missing-disclosure",
          sanctionType: "fine",
          amount: 25000,
        },
        {
          id: "empty-brokercheck-value",
          disclosureId: brokerCheckDisclosure.id,
          sanctionType: "fine",
        },
        {
          id: "unsupported-brokercheck-censure",
          disclosureId: brokerCheckDisclosure.id,
          sanctionType: "censure",
        },
      ],
      fieldAssertions: [
        { ...advisorHubFineAssertion, targetTable: "Disclosure" },
        { ...advisorHubFineAssertion, targetId: "missing-sanction" },
        { ...advisorHubFineAssertion, targetId: brokerCheckSourcedFine.id },
        {
          ...advisorHubFineAssertion,
          targetId: "unsupported-censure",
          assertedValue: "not numeric",
        },
        {
          ...advisorHubFineAssertion,
          id: "empty-supported-assertion",
          assertedValue: "pending",
        },
      ],
    });

    expect(rows).toEqual([]);
  });
});
