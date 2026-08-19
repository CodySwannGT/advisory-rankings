import { describe, expect, it } from "vitest";
import {
  advisorReviewedCorrectionRequests,
  advisorReviewedRegulatoryDiscrepancies,
} from "../src/harper/resource-advisor-discrepancy-notes.js";
import type {
  AdvisorCorrectionRequestRow,
  RegulatoryDiscrepancyRow,
} from "../src/types/harper-schema.js";

const reviewedDiscrepancy: RegulatoryDiscrepancyRow = {
  advisorHubValue: "AdvisorHub",
  advisorId: "advisor-1",
  brokerCheckSourceRef: "https://brokercheck.finra.org/individual/summary/123",
  brokerCheckValue: "BrokerCheck",
  fieldName: "firmName",
  id: "disc-1",
  reviewedAt: "2026-06-20T10:00:00.000Z",
  reviewerNote: "BrokerCheck confirmed the current firm.",
  severity: "medium",
  status: "accepted_brokercheck",
};

const reviewedCorrection: AdvisorCorrectionRequestRow = {
  advisorId: "advisor-1",
  displayedValue: "Old firm",
  fieldName: "firmName",
  id: "correction-1",
  proposedValue: "Current firm",
  reviewedAt: "2026-06-20T11:00:00.000Z",
  reviewerNote: "Source material supports the correction.",
  sourceRef: "https://example.com/source",
  sourceType: "advisor_site",
  status: "accepted",
};

describe("advisor discrepancy note builders", () => {
  it("filters unresolved rows while projecting reviewed regulatory discrepancies", () => {
    const notes = advisorReviewedRegulatoryDiscrepancies(
      {
        regulatoryDiscrepancies: [
          reviewedDiscrepancy,
          { ...reviewedDiscrepancy, id: "disc-open", status: "open" },
          { ...reviewedDiscrepancy, id: "disc-blank-note", reviewerNote: "" },
          {
            ...reviewedDiscrepancy,
            advisorId: "advisor-2",
            id: "disc-other-advisor",
          },
        ],
      },
      "advisor-1"
    );

    expect(notes).toEqual([
      {
        advisorHubValue: "AdvisorHub",
        brokerCheckSourceRef:
          "https://brokercheck.finra.org/individual/summary/123",
        brokerCheckValue: "BrokerCheck",
        fieldName: "firmName",
        id: "disc-1",
        reviewedAt: "2026-06-20T10:00:00.000Z",
        reviewerNote: "BrokerCheck confirmed the current firm.",
        severity: "medium",
        status: "accepted_brokercheck",
      },
    ]);
  });

  it("filters public correction notes and tolerates omitted correction rows", () => {
    expect(
      advisorReviewedCorrectionRequests(
        { regulatoryDiscrepancies: [] },
        "advisor-1"
      )
    ).toEqual([]);

    const notes = advisorReviewedCorrectionRequests(
      {
        correctionRequests: [
          reviewedCorrection,
          {
            ...reviewedCorrection,
            id: "correction-pending",
            status: "pending",
          },
          {
            ...reviewedCorrection,
            id: "correction-blank-note",
            reviewerNote: " ",
          },
          {
            ...reviewedCorrection,
            id: "correction-no-source",
            sourceContext: "",
            sourceRef: "",
          },
          {
            ...reviewedCorrection,
            advisorId: "advisor-2",
            id: "correction-other-advisor",
          },
        ],
        regulatoryDiscrepancies: [],
      },
      "advisor-1"
    );

    expect(notes).toEqual([
      {
        displayedValue: "Old firm",
        fieldName: "firmName",
        id: "correction-1",
        proposedValue: "Current firm",
        reviewedAt: "2026-06-20T11:00:00.000Z",
        reviewerNote: "Source material supports the correction.",
        sourceContext: undefined,
        sourceRef: "https://example.com/source",
        sourceType: "advisor_site",
        status: "accepted",
      },
    ]);
  });
});
