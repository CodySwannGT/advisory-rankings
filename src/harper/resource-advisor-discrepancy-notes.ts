import { cmpDesc } from "./resource-pagination.js";
import type {
  ReviewedAdvisorCorrectionNote,
  ReviewedRegulatoryDiscrepancyNote,
} from "../types/advisor-profile.js";
import type {
  AdvisorCorrectionRequestRow,
  RegulatoryDiscrepancyRow,
} from "../types/harper-schema.js";

/** Minimal row bundle used to build public reviewed discrepancy notes. */
export interface AdvisorDiscrepancyNoteSource {
  readonly regulatoryDiscrepancies: readonly RegulatoryDiscrepancyRow[];
  readonly correctionRequests?: readonly AdvisorCorrectionRequestRow[];
}

/**
 * Builds public reviewed discrepancy notes for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against discrepancy rows.
 * @returns Reviewed non-open discrepancy notes only.
 */
export function advisorReviewedRegulatoryDiscrepancies(
  db: AdvisorDiscrepancyNoteSource,
  advisorId: string
): readonly ReviewedRegulatoryDiscrepancyNote[] {
  return db.regulatoryDiscrepancies
    .filter(row => isPublicReviewedDiscrepancy(row, advisorId))
    .slice()
    .sort(cmpDesc("reviewedAt"))
    .map(row => ({
      id: row.id,
      fieldName: row.fieldName,
      status: row.status,
      severity: row.severity,
      reviewerNote: row.reviewerNote ?? "",
      reviewedAt: row.reviewedAt,
      brokerCheckValue: row.brokerCheckValue,
      advisorHubValue: row.advisorHubValue,
      brokerCheckSourceRef: row.brokerCheckSourceRef,
    }));
}

/**
 * Builds public reviewed correction request notes for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against correction request rows.
 * @returns Reviewed correction request notes only.
 */
export function advisorReviewedCorrectionRequests(
  db: AdvisorDiscrepancyNoteSource,
  advisorId: string
): readonly ReviewedAdvisorCorrectionNote[] {
  return (db.correctionRequests ?? [])
    .filter(row => isPublicReviewedCorrectionRequest(row, advisorId))
    .slice()
    .sort(cmpDesc("reviewedAt"))
    .map(row => ({
      id: row.id,
      fieldName: row.fieldName,
      status: row.status,
      reviewerNote: row.reviewerNote ?? "",
      reviewedAt: row.reviewedAt,
      displayedValue: row.displayedValue,
      proposedValue: row.proposedValue,
      sourceType: row.sourceType,
      sourceRef: row.sourceRef,
      sourceContext: row.sourceContext,
    }));
}

/**
 * Checks whether a discrepancy has been resolved enough for public copy.
 * @param row - Persisted discrepancy row.
 * @param advisorId - Advisor ID currently being rendered.
 * @returns True when the row can be shown on a public profile.
 */
function isPublicReviewedDiscrepancy(
  row: RegulatoryDiscrepancyRow,
  advisorId: string
): boolean {
  return (
    row.advisorId === advisorId &&
    row.status !== "open" &&
    Boolean(row.reviewedAt) &&
    Boolean(row.reviewerNote?.trim())
  );
}

/**
 * Checks whether a correction request is reviewed and source-backed enough for public copy.
 * @param row - Persisted correction request row.
 * @param advisorId - Advisor ID currently being rendered.
 * @returns True when the row can be shown on a public profile.
 */
function isPublicReviewedCorrectionRequest(
  row: AdvisorCorrectionRequestRow,
  advisorId: string
): boolean {
  return (
    row.advisorId === advisorId &&
    row.status !== "pending" &&
    Boolean(row.reviewedAt) &&
    Boolean(row.reviewerNote?.trim()) &&
    (Boolean(row.sourceRef?.trim()) || Boolean(row.sourceContext?.trim()))
  );
}
